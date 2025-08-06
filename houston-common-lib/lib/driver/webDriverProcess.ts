import { ProcessBase, IDriverProcess, ExitedProcess } from "@/process/ProcessBase";
import { Command } from "@/process/Command";
import { Server } from "@/server";
import { ProcessError } from "@/errors";
import { IHoustonDriver } from "@/driver/types";
import { err, ok, Result, ResultAsync } from "neverthrow";


export function factory(): IHoustonDriver["Process"] {

  class WebProcess extends ProcessBase implements IDriverProcess {
    private fakeOutput: Uint8Array = new Uint8Array();
    private stderr: string = "";

    constructor(server: Server, command: Command, defer?: boolean) {
      super(server, command);
      if (defer !== true) {
        this.execute();
      }
    }

    execute(): this {
      console.warn("WebProcess.execute(): no-op in browser");
      return this;
    }

    wait(_failIfNonZero: boolean = true): ResultAsync<ExitedProcess, ProcessError> {
      console.warn("WebProcess.wait(): returning dummy ExitedProcess");

      const fakeExited = new ExitedProcess(
        this.server,
        this.command,
        0, // exitStatus
        this.fakeOutput,
        this.stderr,
        undefined // signal
      );

      return ResultAsync.fromPromise(
        Promise.resolve(fakeExited),
        () => new ProcessError("wait() failed in browser")
      );
    }

    write(_data: Uint8Array, _stream: boolean = false): Result<null, ProcessError> {
      console.warn("WebProcess.write(): not supported in browser");
      return err(new ProcessError("Cannot write to process in browser"));
    }

    terminate(): this {
      console.warn("WebProcess.terminate(): no-op in browser");
      return this;
    }

    close(): this {
      console.warn("WebProcess.close(): no-op in browser");
      return this;
    }

    streamBinary(_callback: (output: Uint8Array) => void): Result<null, ProcessError> {
      console.warn("WebProcess.streamBinary(): storing callback but no actual data will stream");
      return ok(null);
    }
  }
  return WebProcess;
}
