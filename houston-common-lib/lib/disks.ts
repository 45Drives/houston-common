import { server, Command, safeJsonParse } from "@/index"
import { ResultAsync } from "neverthrow";

export namespace Disks {
    export function runCommandJson(command: string[], options: any = {}): ResultAsync<any, Error> {
        return server.execute(new Command(command, options)).map((proc => proc.getStdout())).andThen(safeJsonParse);
    }

    export function fetchLsdev(): ResultAsync<any, Error> {
        return runCommandJson(["/opt/45drives/tools/lsdev", "--json"]);
    }

}
