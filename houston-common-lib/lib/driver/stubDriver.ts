import { IHoustonDriver } from "./types";
import { ProcessBase, IDriverProcess, ExitedProcess } from "@/process/ProcessBase";
import { Command } from "@/process/Command";
import { Server } from "@/server";
import { ProcessError } from "@/errors";

import { Result, ResultAsync } from "neverthrow";


export function factory(): IHoustonDriver {
    class CockpitProcess extends ProcessBase implements IDriverProcess {
       
        constructor(server: Server, command: Command, _defer?: boolean) {
            throw new Error('not implemented');
            super(server, command);

            // if (defer !== true) {
            //     this.execute();
            // }
        }

        public execute(): this {
            throw new Error('not implemented');

            // const { environ, ...rest } = this.command.options;
            // const opts: Cockpit.SpawnOptions = rest;
            // if (environ) {
            //     opts.environ = Object.entries(environ).map(([key, value]) => `${key}=${value}`);
            // }
            // this.spawnHandle = cockpit.spawn(this.command.argv, {
            //     ...opts,
            //     binary: true,
            //     err: "message",
            //     host: this.server.host,
            // });
            // return this;
        }

        public wait(_failIfNonZero: boolean = true): ResultAsync<ExitedProcess, ProcessError> {

            throw new Error('not implemented');
            
            // return ResultAsync.fromPromise(
            //     new Promise((resolve, reject) => {
            //         if (this.spawnHandle === undefined) {
            //             return reject(new ProcessError(this.prefixMessage("Process never started!")));
            //         }
            //         this.spawnHandle
            //             .then((stdout, stderr) => {
            //                 const exitStatus = 0;
            //                 resolve(new ExitedProcess(this.server, this.command, exitStatus, stdout, stderr));
            //             })
            //             .catch((ex, stdout) => {
            //                 if (
            //                     (ex.problem !== null && ex.problem !== undefined) ||
            //                     ex.exit_status === null ||            throw new Error('not implemented');
            //                     ex.exit_status === undefined
            //                 ) {
            //                     switch (ex.problem) {
            //                         case "unknown-host":
            //                             return reject(new UnknownHost(`${this.server.host!}: ${ex.message}`));
            //                         case "not-found":
            //                             return reject(new NotFound(this.prefixMessage(ex.message)));
            //                         case "authentication-failed":
            //                             return reject(new AuthenticationFailed(`${this.server.host!}: ${ex.message}`));
            //                         default:
            //                             return reject(
            //                                 new ProcessError(`${this.prefixMessage(            throw new Error('not implemented');ex.message)} (${ex.problem})`)
            //                             );
            //                     }
            //                 }
            //                 const exitedProcess = new ExitedProcess(
            //                     this.server,
            //                     this.command,
            //                     ex.exit_status,
            //                     stdout,
            //                     ex.message
            //                 );
            //                 if (failIfNonZero && ex.exit_status !== 0) {
            //                     exitedProcess.logDebug(console.error);
            //                     return reject(
            //                         new NonZeroExit(this.prefixMessage(`${ex.message} (${ex.exit_status})`))
            //                     );
            //                 }
            //                 resolve(exitedProcess);
            //             });
            //     }),
            //     (e) => {
            //         if (e instanceof ProcessError) {
            //             return e;
            //         }
            //         return new ProcessError(this.prefixMessage("Unknown error"), {
            //             cause: e,
            //         });
            //     }
            // );
        }

        public write(_data: Uint8Array, _stream: boolean = false): Result<null, ProcessError> {
            throw new Error('not implemented');

            // if (this.spawnHandle === undefined) {
            //     return err(new ProcessError(this.prefixMessage("process not running!")));
            // }
            // this.spawnHandle.input(data, stream);
            // return ok(null);
        }

        public terminate(): this {

            throw new Error('not implemented');
            // if (this.spawnHandle) {
            //     this.spawnHandle.close("terminated");
            // }
            // return this;
        }

        public close(): this {

            throw new Error('not implemented');
            // if (this.spawnHandle) {
            //     this.spawnHandle.close();
            // }
            // return this;
        }

        public streamBinary(_callback: (output: Uint8Array) => void): Result<null, ProcessError> {

            throw new Error('not implemented');
            // if (this.spawnHandle === undefined) {
            //     return err(new ProcessError(this.prefixMessage("process not running!")));
            // }
            // this.spawnHandle.stream(callback);
            // return ok(null);
        }
    }

    const HoustonDriverCockpit: IHoustonDriver = {
        Process: CockpitProcess,
        downloadCommandOutputURL(_server, _command, _filename) {
            throw new Error('not implemented');
            // const query = window.btoa(
            //     JSON.stringify({
            //         ...command.options,
            //         err: "message",
            //         host: server.host,
            //         payload: "stream",
            //         binary: "raw",
            //         spawn: command.argv,
            //         external: {
            //             "content-disposition": 'attachment; filename="' + encodeURIComponent(filename) + '"',
            //             "content-type": "application/x-xz, application/octet-stream",
            //         },
            //     })
            // );
            // const prefix = new URL(cockpit.transport.uri("channel/" + cockpit.transport.csrf_token))
            //     .pathname;
            // const url = prefix + "?" + query;
            // return url;
        },
        gettext: (message: string) => message,
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
    };

    return HoustonDriverCockpit;
}
