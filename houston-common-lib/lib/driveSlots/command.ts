import script from "./script.py?raw";

import { PythonCommand } from "@/process";

export type SlotsCommandOpts = {
    live?: boolean;
    includeNonAliased?: boolean;
}

export function slotsCommand(opts: SlotsCommandOpts = {}) {
    const args = [];
    if (opts.includeNonAliased) {
        args.push("--include-non-aliased");
    }
    if (opts.live) {
        args.push("--live");
    }
    return new PythonCommand(script, args, { superuser: "try" });
}
