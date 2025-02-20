import { Server } from "@/server";
import { Result, ResultAsync } from "neverthrow";
import { ProcessError } from "@/errors";
import { Maybe } from "monet";
import { Command } from "@/process/Command";

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

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

export interface IProcess extends IDriverProcess {
  write(data: string | Uint8Array, stream?: boolean): Result<null, ProcessError>;

  stream(callback: (output: string) => void): Result<null, ProcessError>;
}
