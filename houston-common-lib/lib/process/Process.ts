import { Result } from "neverthrow";
import { ProcessError } from "@/errors";
import { HoustonDriver } from "@/driver";
import { type IProcess } from "./ProcessBase";

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
const utf8Encoder = new TextEncoder();

const DriverProcess = HoustonDriver.Process;

export class Process extends DriverProcess implements IProcess {
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
