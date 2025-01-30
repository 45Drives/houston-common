import { Server, Process, Command, safeJsonParse } from "@45drives/houston-common-lib";
import { ResultAsync } from "neverthrow";

const server = new Server();

export function runCommandJson(command: string[], options: any = {}): ResultAsync<any, Error> {
    const process = new Process(server, new Command(command, options));

    return process.wait().andThen((exitedProcess) => {
        if (exitedProcess.failed()) {
            return ResultAsync.fromPromise(
                Promise.reject(new Error(`Command failed: ${ command.join(" ") }`)),
                (e) => e as Error
            );
        }
        return safeJsonParse(exitedProcess.getStdout());
    });
}

export function fetchLsdev(): ResultAsync<any, Error> {
    return runCommandJson(["/opt/45drives/tools/lsdev", "--json"]);
}

export function fetchDiskInfo(): ResultAsync<any, Error> {
    return runCommandJson(["/public/scripts/disk_info"]);
}

