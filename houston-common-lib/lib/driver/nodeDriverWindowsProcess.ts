import { ProcessBase, IDriverProcess, ExitedProcess } from "@/process/ProcessBase";
import { Command } from "@/process/Command";
import { Server } from "@/server";
import { NonZeroExit, ProcessError } from "@/errors";
import { IHoustonDriver } from "@/driver/types";
import { err, errAsync, ok, Result, ResultAsync } from "neverthrow";

import type child_process from "child_process";
import type stream from "stream";

export function factory(): IHoustonDriver["Process"] {
  const child_process = require("child_process") as typeof import("child_process");
  const { Buffer } = require("node:buffer") as typeof import("node:buffer");

  class NodeProcessWindows extends ProcessBase implements IDriverProcess {
    private child?: child_process.ChildProcessByStdio<
      stream.Writable,
      stream.Readable,
      stream.Readable
    >;

    private promise?: Promise<ExitedProcess>;

    private stdoutBuffer: Buffer;
    private stderrBuffer: string;

    private streamCallback: (data: Buffer) => void;

    constructor(server: Server, command: Command, defer?: boolean) {
      super(server, command);

      this.stdoutBuffer = Buffer.alloc(0);
      this.stderrBuffer = "";
      this.streamCallback = (data) => {
        this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, data]);
      };

      if (defer !== true) {
        this.execute();
      }
    }

    public execute(): this {
      const argv = this.command.argv;
      if (argv.length < 1) {
        throw new ProcessError("Empty argv!");
      }
      const argv0 = argv[0]!;

      if (this.server.host && this.server.host !== "localhost") {
        throw new ProcessError("Remote host execution not implemented");
      }

      const [command, ...args] = this.command.argv as [string, ...string[]];
      const opts: child_process.SpawnOptions = {
        argv0,
        windowsHide: true, // Hide the window when running a process
      };
      if (this.command.options.directory) {
        opts.cwd = this.command.options.directory;
      }
      if (this.command.options.environ) {
        opts.env = this.command.options.environ;
      }

      this.stdoutBuffer = Buffer.alloc(0);
      this.stderrBuffer = "";

      // Adjusting spawn command for Windows
      this.child = child_process.spawn(command, args, { ...opts, stdio: ["pipe", "pipe", "pipe"] });
      this.child.stderr.setEncoding("utf-8");
      this.child.stdout.on("data", (chunk: Buffer) => {
        this.streamCallback(chunk);
      });
      this.child.stderr.on("data", (chunk: string) => {
        this.stderrBuffer += chunk;
      });

      this.promise = new Promise((resolve, reject) => {
        if (this.child === undefined) {
          return reject(new ProcessError(this.prefixMessage("Process never started!")));
        }
        const child = this.child;

        child.on("close", async (code, signal) => {
          if (code === null) {
            return reject(
              new ProcessError(`${this.prefixMessage("terminated by signal")} (${signal})`)
            );
          }
          const exitedProcess = new ExitedProcess(
            this.server,
            this.command,
            code,
            Uint8Array.from(this.stdoutBuffer),
            this.stderrBuffer,
            signal ?? undefined
          );
          resolve(exitedProcess);
        });
      });

      return this;
    }

    public wait(failIfNonZero: boolean = true): ResultAsync<ExitedProcess, ProcessError> {
      if (this.promise === undefined) {
        return errAsync(new ProcessError(this.prefixMessage("Process never started!")));
      }
      return ResultAsync.fromPromise(
        this.promise?.then((exitedProcess) => {
          if (failIfNonZero && exitedProcess.exitStatus !== 0) {
            exitedProcess.logDebug(console.error);
            return Promise.reject(
              new NonZeroExit(
                this.prefixMessage(`${exitedProcess.getStderr()} (${exitedProcess.exitStatus})`)
              )
            );
          }
          return Promise.resolve(exitedProcess);
        }),
        (e) => {
          if (e instanceof ProcessError) {
            return e;
          }
          return new ProcessError(this.prefixMessage("Unknown error"), {
            cause: e,
          });
        }
      );
    }

    public write(data: Uint8Array, stream: boolean = false): Result<null, ProcessError> {
      if (this.child === undefined) {
        return err(new ProcessError(this.prefixMessage("process not running!")));
      }
      this.child.stdin.write(data);
      if (stream === false) {
        this.child.stdin.end();
      }
      return ok(null);
    }

    public terminate(): this {
      this.child?.kill();
      return this;
    }

    public close(): this {
      if (this.child?.stdin.closed === false) {
        this.child.stdin.end();
      }
      if (this.child?.stdout.closed === false) {
        this.child.stdout.destroy();
      }
      return this;
    }

    public streamBinary(callback: (output: Uint8Array) => void): Result<null, ProcessError> {
      this.streamCallback = (data: Buffer) => {
        callback(Uint8Array.from(data));
      };
      return ok(null);
    }
  }

  return NodeProcessWindows;
}
