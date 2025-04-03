import { Server } from "@/server";
import { slotsCommand } from "./command";
import { Drive, DriveSlot, GetDriveSlotsOpts } from "./types";
import { ProcessError } from "@/errors";
import { ResultAsync } from "neverthrow";
import { safeJsonParse } from "@/utils";

export function getDriveSlots(
  server: Server,
  opts: GetDriveSlotsOpts & { excludeEmpty: true }
): ResultAsync<(DriveSlot & { drive: Drive })[], ProcessError | SyntaxError>;
export function getDriveSlots(
  server: Server,
  opts?: GetDriveSlotsOpts & { includeEmpty?: false }
): ResultAsync<DriveSlot[], ProcessError | SyntaxError>;
export function getDriveSlots(
  server: Server,
  opts: GetDriveSlotsOpts = {}
): ResultAsync<DriveSlot[], ProcessError | SyntaxError> {
  return server
    .execute(slotsCommand({ live: false, includeNonAliased: opts.includeNonAliased }))
    .map((proc) => proc.getStdout())
    .andThen((output) => safeJsonParse<DriveSlot[]>(output))
    .map((slots) => slots as DriveSlot[])
    .map((slots) => (opts.excludeEmpty ? slots.filter((slot) => slot.drive !== null) : slots));
}
