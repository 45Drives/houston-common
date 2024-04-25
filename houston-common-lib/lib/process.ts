import { Server } from "@/server";
import cockpit from "cockpit";
import { Result, Ok, Err } from "@thames/monads";

const utf8Decoder = new TextDecoder("utf-8");
const utf8Encoder = new TextEncoder();

export interface ProcessOptions
  extends Pick<
    cockpit.SpawnOptions,
    "directory" | "environ" | "pty" | "superuser"
  > {
  /**
   * Do not start process immediately - must call Process.execute() to start
   */
  defer?: boolean;
}

export class ProcessError extends Error {}

export class NonZeroExit extends ProcessError {}

export class ProcessBase {
  public readonly server: Server;
  public readonly argv: string[];
  public readonly spawnOptions: cockpit.SpawnOptions & { binary: true };

  constructor(
    server: Server,
    argv: string[],
    spawnOptions: cockpit.SpawnOptions & { binary: true }
  ) {
    this.server = server;
    this.argv = argv;
    this.spawnOptions = spawnOptions;
  }

  public getName(): string {
    return this.argv[0];
  }

  public toString(): string {
    return `Process(${JSON.stringify(this.argv)}, ${JSON.stringify(this.spawnOptions)})`;
  }
}

export class ExitedProcess extends ProcessBase {
  public readonly exitStatus: number;
  public readonly stdout: Uint8Array;
  public readonly stderr: string;
  public readonly killedBy?: string;

  constructor(
    server: Server,
    argv: string[],
    spawnOptions: cockpit.SpawnOptions & { binary: true },
    exitStatus: number,
    stdout: Uint8Array,
    stderr: string,
    killedBy?: string
  ) {
    super(server, argv, spawnOptions);
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
}

export class Process extends ProcessBase {
  private spawnHandle?: cockpit.Spawn<Uint8Array>;

  constructor(server: Server, argv: string[], options: ProcessOptions = {}) {
    const {
      defer,
      ...spawnOptions
    }: ProcessOptions & cockpit.SpawnOptions & { binary: true } = {
      ...options,
      binary: true,
      err: "message",
      host: server.host,
    };
    super(server, argv, spawnOptions);

    if (defer !== true) {
      this.execute();
    }
  }

  public execute(): Process {
    this.spawnHandle = cockpit.spawn(this.argv, this.spawnOptions);
    return this;
  }

  public wait(
    failIfNonZero: boolean = false
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
                this.argv,
                this.spawnOptions,
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
                this.argv,
                this.spawnOptions,
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
