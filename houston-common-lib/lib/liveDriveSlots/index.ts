export * from "./types";

import { DriveSlot, LiveDriveSlotsHandle } from "@/liveDriveSlots/types";
import { Process, PythonCommand } from "@/process";
import script from "./script.py?raw";
import { Server } from "@/server";

const liveDriveSlotsCommand = new PythonCommand(script, [], { superuser: "try" });

type LiveDriveSlotsMessageAllSlots = {
  type: "reportAll";
  slots: DriveSlot[];
};

type LiveDriveSlotsMessageDriveAdded = {
  type: "change";
  slot: DriveSlot;
};

type LiveDriveSlotsCtx = {
  proc: Process;
  slots: DriveSlot[];
  stop: boolean;
};

type LiveDriveSlotsMessage = LiveDriveSlotsMessageAllSlots | LiveDriveSlotsMessageDriveAdded;

function onStream(output: string, ctx: LiveDriveSlotsCtx, setter: (slots: DriveSlot[]) => void) {
  try {
    const message = JSON.parse(output) as LiveDriveSlotsMessage;

    switch (message.type) {
      case "reportAll":
        ctx.slots = message.slots;
        setter([...ctx.slots]);
        break;
      case "change":
        const slot = message.slot;
        ctx.slots = ctx.slots.map((s) => (s.slotId === slot.slotId ? slot : s));
        setter([...ctx.slots]);
        break;
      default:
        throw new TypeError(`Unknown LiveDriveSlotsMessage type: ${(message as any).type}`);
    }
  } catch (e) {
    if (e instanceof Error) window.reportHoustonError(e);
  }
}

export function startLiveDriveSlotsWatcher(
  server: Server,
  setter: (slots: DriveSlot[]) => void
): LiveDriveSlotsHandle {
  const ctx: LiveDriveSlotsCtx = {
    proc: server.spawnProcess(liveDriveSlotsCommand, true),
    slots: [],
    stop: false,
  };
  const start = () => {
    if (ctx.stop) {
      return;
    }
    ctx.proc.execute();
    ctx.proc.stream((output) => onStream(output, ctx, setter));
    ctx.proc.wait().match(
      () => start(),
      (e) => {
        window.reportHoustonError(e, "Live drive slots watcher died.");
        start();
      }
    );
  };
  start();

  return {
    stop: () => {
      ctx.stop = true;
      ctx.proc.terminate();
    },
  };
}
