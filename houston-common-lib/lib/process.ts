import { Server } from "@/server";
import { Result, ResultAsync } from "neverthrow";
import { ProcessError } from "@/errors";
import { Maybe } from "monet";
import { HoustonDriver } from "@/driver";

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
const utf8Encoder = new TextEncoder();

export type CommandOptions = {
  directory?: string;
  environ?: string[];
  pty?: boolean;
  superuser?: "try" | "require";
};

export class Command {
  public readonly argv: string[];
  public readonly options: CommandOptions;

  constructor(argv: string[], opts: CommandOptions = {}) {
    this.argv = argv;
    this.options = opts;
  }

  public getName(): string {
    return this.argv[0] ?? "";
  }

  public toString(): string {
    return `Command(${JSON.stringify(this.argv)}, ${JSON.stringify(this.options)})`;
  }
}

export class BashCommand extends Command {
  constructor(script: string, args: string[] = [], opts: CommandOptions & { arg0?: string } = {}) {
    const arg0 = opts.arg0 ?? "HoustonBashCommand";
    super(["/usr/bin/env", "bash", "-c", script, arg0, ...args], opts);
  }
}

export class PythonCommand extends Command {
  constructor(script: string, args: string[] = [], opts: CommandOptions = {}) {
    super(["/usr/bin/env", "python3", "-c", script, ...args], opts);
  }
}

export class ProcessBase {
  public readonly server: Server;
  public readonly command: Command;

  constructor(server: Server, command: Command) {
    this.server = server;
    this.command = command;
  }

  public prefixMessage(message: string): string {
    const arg0Prefix = `${this.getName()}: `;
    message = message.startsWith(arg0Prefix) ? message.replace(arg0Prefix, "") : message;
    return Maybe.fromUndefined(this.server.host)
      .fold("")((host) => `${host}: `)
      .concat(arg0Prefix, message);
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

export interface IDriverProcess extends ProcessBase {
  execute(): this;
  wait(failIfNonZero?: boolean): ResultAsync<ExitedProcess, ProcessError>;
  write(data: Uint8Array, stream?: boolean): Result<null, ProcessError>;
  terminate(): this;
  close(): this;
  streamBinary(callback: (output: Uint8Array) => void): Result<null, ProcessError>;
}

export class Process extends HoustonDriver.Process {
  public write(data: string | Uint8Array, stream: boolean = false): Result<null, ProcessError> {
    if (typeof data === "string") {
      data = utf8Encoder.encode(data);
    }
    return super.write(data, stream);
  }

  public stream(callback: (output: string) => void) {
    return this.streamBinary((output: Uint8Array) => callback(utf8Decoder.decode(output)));
  }
}
