import script from "./script.py?raw";

import { PythonCommand } from "@/process";

export type SlotsCommandOpts = {
    live?: boolean;
}

export function slotsCommand(opts: SlotsCommandOpts = {}) {
    const args = opts.live ? ["--live"] : [];
    return new PythonCommand(script, args, { superuser: "try" });
}
