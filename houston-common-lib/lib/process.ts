import { Server } from "@/server";
import Cockpit from "cockpit";
import { Result, Ok, Err } from "@thames/monads";

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
const utf8Encoder = new TextEncoder();

export type CommandOptions = Omit<
  Cockpit.SpawnOptions,
  "host" | "binary" | "err"
>;

export class Command {
  public readonly argv: string[];
  public readonly spawnOptions: Cockpit.SpawnOptions & { binary: true };

  constructor(
    argv: string[],
    opts: CommandOptions = {}
  ) {
    this.argv = argv;
    this.spawnOptions = {
      ...opts,
      binary: true,
      err: "message"
    };
  }

  public getName(): string {
    return this.argv[0] ?? "";
  }

  public toString(): string {
    return `Command(${JSON.stringify(this.argv)}, ${JSON.stringify(
      this.spawnOptions
    )})`;
  }
}

export class BashCommand extends Command {
  constructor(
    script: string,
    args: string[] = [],
    opts: CommandOptions & { arg0?: string } = {}
  ) {
    const arg0 = opts.arg0 ?? "HoustonBashCommand";
    super(["/usr/bin/env", "bash", "-c", script, arg0, ...args], opts);
  }
}

export class ProcessError extends Error {}

export class NonZeroExit extends ProcessError {}

export class ProcessBase {
  public readonly server: Server;
  public readonly command: Command;

  constructor(server: Server, command: Command) {
    this.server = server;
    this.command = command;
  }

  public getName(): string {
    return this.command.getName();
  }

  public toString(): string {
    return `Process(${this.server}, ${this.command})`;
  }
}

export class ExitedProcess extends ProcessBase {
  public readonly exitStatus: number;
  public readonly stdout: Uint8Array;
  public readonly stderr: string;
  public readonly killedBy?: string;

  constructor(
    server: Server,
    command: Command,
    exitStatus: number,
    stdout: Uint8Array,
    stderr: string,
    killedBy?: string
  ) {
    super(server, command);
    this.exitStatus = exitStatus;
    this.stdout = stdout;
    this.stderr = stderr;
    this.killedBy = killedBy;
  }

  getStdout(binary?: false): string;
  getStdout(binary: true): Uint8Array;
  getStdout(binary: boolean = false): string | Uint8Array {
    if (binary) {
      return this.stdout;
    }
    return utf8Decoder.decode(this.stdout);
  }

  getStderr(): string {
    return this.stderr;
  }

  succeeded(): boolean {
    return this.exitStatus === 0;
  }

  failed(): boolean {
    return !this.succeeded();
  }

  logDebug(logger: (...args: any[]) => void = console.log): void {
    logger(`${this}:
stdout:
${this.getStdout()}
stderr:
${this.getStderr()}`);
  }

  toString(): string {
    const str = `Exited${super.toString()} (exited ${this.exitStatus})`;
    if (!this.killedBy) return str;
    return str + ` (killed by ${this.killedBy})`;
  }
}

export class Process extends ProcessBase {
  private spawnHandle?: Cockpit.Spawn<Uint8Array>;

  constructor(server: Server, command: Command, defer?: boolean) {
    super(server, command);

    if (defer !== true) {
      this.execute();
    }
  }

  public execute(): Process {
    this.spawnHandle = cockpit.spawn(this.command.argv, {
      ...this.command.spawnOptions,
      host: this.server.host,
    });
    return this;
  }

  public wait(
    failIfNonZero: boolean = true
  ): Promise<Result<ExitedProcess, ProcessError>> {
    return new Promise((resolve) => {
      if (this.spawnHandle === undefined) {
        return resolve(Err(new ProcessError("Process never started!")));
      }
      this.spawnHandle
        .then((stdout, stderr) => {
          const exitStatus = 0;
          resolve(
            Ok(
              new ExitedProcess(
                this.server,
                this.command,
                exitStatus,
                stdout,
                stderr
              )
            )
          );
        })
        .catch((ex, stdout) => {
          if (
            (ex.problem !== null && ex.problem !== undefined) ||
            ex.exit_status === null ||
            ex.exit_status === undefined
          ) {
            return resolve(
              Err(
                new ProcessError(
                  `${this.getName()}: ${ex.message} (${ex.problem})`
                )
              )
            );
          }
          if (failIfNonZero && ex.exit_status !== 0) {
            return resolve(
              Err(
                new NonZeroExit(
                  `${this.getName()}: ${ex.message} (${ex.exit_status})`
                )
              )
            );
          }
          resolve(
            Ok(
              new ExitedProcess(
                this.server,
                this.command,
                ex.exit_status,
                stdout,
                ex.message
              )
            )
          );
        });
    });
  }

  public write(
    data: string | Uint8Array,
    stream: boolean = false
  ): Result<null, ProcessError> {
    if (this.spawnHandle === undefined) {
      return Err(new ProcessError("process not running!"));
    }
    if (typeof data === "string") {
      data = utf8Encoder.encode(data);
    }
    this.spawnHandle.input(data, stream);
    return Ok(null);
  }

  public terminate(): Process {
    if (this.spawnHandle) {
      this.spawnHandle.close("terminated");
    }
    return this;
  }

  public close(): Process {
    if (this.spawnHandle) {
      this.spawnHandle.close();
    }
    return this;
  }
}
