import { Result, Ok, Err } from "@thames/monads";
import { Command, Process, ExitedProcess, ProcessError } from "@/process";
import { User } from "@/user";
import { Group } from "@/group";

export class Server {
  public readonly host?: string;
  private hostname?: string;
  private ipAddress?: string;

  constructor(host?: string) {
    this.host = host;
  }

  async isAccessible(): Promise<Result<true, ProcessError>> {
    return (await this.execute(new Command(["true"]), true)).andThen(() =>
      Ok(true)
    );
  }

  async getHostname(
    cache: boolean = true
  ): Promise<Result<string, ProcessError>> {
    if (this.hostname === undefined || cache === false) {
      return (await this.execute(new Command(["hostname"]), true)).map(
        (proc) => (this.hostname = proc.getStdout().trim())
      );
    }
    return Ok(this.hostname);
  }

  async getIpAddress(cache: boolean = true): Promise<Result<string, Error>> {
    if (this.ipAddress === undefined || cache === false) {
      const target = "1.1.1.1";
      return (
        await this.execute(new Command(["ip", "route", "get", target]), true)
      ).andThen((proc) => {
        const match = proc.getStdout().match(/src (ipAddress:[^\t ]+) /);
        if (match === null || match.groups === undefined) {
          const e = Error(`Malformed output from ${proc}`);
          console.log(e);
          console.log(proc.getStdout());
          return Err(e);
        }
        this.ipAddress = match.groups["ipAddress"];
        return Ok(this.ipAddress);
      });
    }
    return Ok(this.ipAddress);
  }

  spawnProcess(command: Command, defer: boolean = false): Process {
    return new Process(this, command, defer);
  }

  execute(
    command: Command,
    failIfNonZero?: boolean
  ): Promise<Result<ExitedProcess, ProcessError>> {
    return this.spawnProcess(command).wait(failIfNonZero);
  }

  getLocalUsers(): User[] {
    
  }

  toString(): string {
    return `Server(${this.host ?? "localhost"})`;
  }
}
