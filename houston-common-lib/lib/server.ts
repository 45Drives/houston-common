import { Result, Ok, Err } from "@thames/monads";
import {
  Process,
  ProcessOptions,
  ExitedProcess,
  ProcessError,
} from "@/process";

export class Server {
  public readonly host: string;
  private hostname?: string;
  private ipAddress?: string;

  constructor(host?: string) {
    this.host = host ?? "localhost";
  }

  spawnProcess(argv: string[], options?: ProcessOptions): Process {
    return new Process(this, argv, options);
  }

  execute(
    argv: string[],
    options?: ProcessOptions,
    failIfNonZero: boolean = false
  ): Promise<Result<ExitedProcess, ProcessError>> {
    return this.spawnProcess(argv, options).wait(failIfNonZero);
  }

  async isAccessible(): Promise<Result<true, ProcessError>> {
    return (await this.execute(["true"])).andThen(() => Ok(true));
  }

  async getHostname(
    cache: boolean = true
  ): Promise<Result<string, ProcessError>> {
    if (this.hostname === undefined || cache === false) {
      return (await this.execute(["hostname"])).match({
        ok: (proc) => Ok((this.hostname = proc.getStdout().trim())),
        err: (e) => Err(e),
      });
    }
    return Ok(this.hostname);
  }

  async getIpAddress(cache: boolean = true): Promise<Result<string, Error>> {
    if (this.ipAddress === undefined || cache === false) {
      const target = "1.1.1.1";
      return (await this.execute(["ip", "route", "get", target], {}, true)).match({
        ok: (proc) => {
          const match = proc.getStdout().match(/src (ipAddress:[^\t ]+) /);
          if (match === null || match.groups === undefined) {
            const e = Error(`Malformed output from ${proc}`);
            console.log(e);
            console.log(proc.getStdout());
            return Err(e);
          }
          this.ipAddress = match.groups["ipAddress"];
          return Ok(this.ipAddress);
        },
        err: (e) => Err(e),
      });
    }
    return Ok(this.ipAddress);
  }

  async getServer(host: string): Promise<Result<Server, Error>> {
    const server = new Server(host);
    return (await server.isAccessible()).andThen(() => Ok(server));
  }
}
