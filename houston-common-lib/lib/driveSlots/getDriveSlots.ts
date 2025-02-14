import { Server } from "@/server";
import { slotsCommand } from "./command";
import { DriveSlot } from "./types";
import { ProcessError } from "@/errors";
import { ResultAsync } from "neverthrow";
import { safeJsonParse } from "@/utils";

export function getDriveSlots(
  server: Server
): ResultAsync<DriveSlot[], ProcessError | SyntaxError> {
  return server
    .execute(slotsCommand({ live: false }))
    .map((proc) => proc.getStdout())
    .andThen((output) => safeJsonParse<DriveSlot[]>(output))
    .map((slots) => slots as DriveSlot[]);
}
