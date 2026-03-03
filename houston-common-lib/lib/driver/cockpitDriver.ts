import { IHoustonDriver } from "./types";
import { ProcessBase, IDriverProcess, ExitedProcess } from "@/process/ProcessBase";
import { Command } from "@/process/Command";
import { Server } from "@/server";
import { AuthenticationFailed, NonZeroExit, NotFound, ProcessError, UnknownHost } from "@/errors";

import { err, ok, Result, ResultAsync } from "neverthrow";

import type Cockpit from "cockpit";

export function factory(): IHoustonDriver {
  class CockpitProcess extends ProcessBase implements IDriverProcess {
    private spawnHandle?: Cockpit.Spawn<Uint8Array>;

    constructor(server: Server, command: Command, defer?: boolean) {
      super(server, command);

      if (defer !== true) {
        this.execute();
      }
    }

    public execute(): this {
      const { environ, ...rest } = this.command.options;
      const opts: Cockpit.SpawnOptions = rest;
      if (environ) {
        opts.environ = Object.entries(environ).map(([key, value]) => `${key}=${value}`);
      }
      this.spawnHandle = cockpit.spawn(this.command.argv, {
        ...opts,
        binary: true,
        err: "message",
        host: this.server.host,
      });
      return this;
    }

    public wait(failIfNonZero: boolean = true): ResultAsync<ExitedProcess, ProcessError> {
      return ResultAsync.fromPromise(
        new Promise((resolve, reject) => {
          if (this.spawnHandle === undefined) {
            return reject(new ProcessError(this.prefixMessage("Process never started!")));
          }
          this.spawnHandle
            .then((stdout, stderr) => {
              const exitStatus = 0;
              resolve(new ExitedProcess(this.server, this.command, exitStatus, stdout, stderr));
            })
            .catch((ex, stdout) => {
              if (
                (ex.problem !== null && ex.problem !== undefined) ||
                ex.exit_status === null ||
                ex.exit_status === undefined
              ) {
                switch (ex.problem) {
                  case "unknown-host":
                    return reject(new UnknownHost(`${this.server.host!}: ${ex.message}`));
                  case "not-found":
                    return reject(new NotFound(this.prefixMessage(ex.message)));
                  case "authentication-failed":
                    return reject(new AuthenticationFailed(`${this.server.host!}: ${ex.message}`));
                  default:
                    return reject(
                      new ProcessError(`${this.prefixMessage(ex.message)} (${ex.problem})`)
                    );
                }
              }
              const exitedProcess = new ExitedProcess(
                this.server,
                this.command,
                ex.exit_status,
                stdout,
                ex.message
              );
              if (failIfNonZero && ex.exit_status !== 0) {
                exitedProcess.logDebug(console.error);
                return reject(
                  new NonZeroExit(this.prefixMessage(`${ex.message} (${ex.exit_status})`))
                );
              }
              resolve(exitedProcess);
            });
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
      if (this.spawnHandle === undefined) {
        return err(new ProcessError(this.prefixMessage("process not running!")));
      }
      this.spawnHandle.input(data, stream);
      return ok(null);
    }

    public terminate(): this {
      if (this.spawnHandle) {
        this.spawnHandle.close("terminated");
      }
      return this;
    }

    public close(): this {
      if (this.spawnHandle) {
        this.spawnHandle.close();
      }
      return this;
    }

    public streamBinary(callback: (output: Uint8Array) => void): Result<null, ProcessError> {
      if (this.spawnHandle === undefined) {
        return err(new ProcessError(this.prefixMessage("process not running!")));
      }
      this.spawnHandle.stream(callback);
      return ok(null);
    }
  }

  const HoustonDriverCockpit: IHoustonDriver = {
    Process: CockpitProcess,
    downloadCommandOutputURL(server, command, filename) {
      const safeName = filename.replace(/[\r\n"]/g, "_");
      const encoded = encodeURIComponent(filename);
    
      // Check the file extension and set the appropriate content type
      const lower = filename.toLowerCase();
      const contentType =
        lower.endsWith(".tar.gz") || lower.endsWith(".tgz")
          ? "application/gzip"
          : lower.endsWith(".xz")
          ? "application/x-xz"
          : "application/octet-stream";  // Default content type for other file types
    
      const query = window.btoa(
        JSON.stringify({
          ...command.options,
          err: "message",
          host: server.host,
          payload: "stream",
          binary: "raw",
          spawn: command.argv,
          external: {
            "content-disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encoded}`,
            "content-type": contentType,  // Set the content type based on file extension
          },
        })
      );
    
      const prefix = new URL(cockpit.transport.uri("channel/" + cockpit.transport.csrf_token)).pathname;
      return prefix + "?" + query;
    }
    
    ,
    gettext: cockpit.gettext,
    localStorage: cockpit.localStorage,
    sessionStorage: cockpit.sessionStorage,
  };

  return HoustonDriverCockpit;
}
