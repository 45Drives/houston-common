export * from "./types";

import type { DriveSlot, LiveDriveSlotsHandle } from "@/liveDriveSlots/types";
import { PythonCommand } from "@/process";
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

type LiveDriveSlotsMessage = LiveDriveSlotsMessageAllSlots | LiveDriveSlotsMessageDriveAdded;

function onStream(output: string, slots: DriveSlot[], setter: (slots: DriveSlot[]) => void) {
  try {
    const message = JSON.parse(output) as LiveDriveSlotsMessage;

    switch (message.type) {
      case "reportAll":
        slots = message.slots;
        setter([...slots]);
        break;
      case "change":
        const slot = message.slot;
        slots = slots.map((s) => s.slotId === slot.slotId ? slot : s);
        setter([...slots]);
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
  const proc = server.spawnProcess(liveDriveSlotsCommand);
  const slots: DriveSlot[] = [];
  proc.stream((output) => onStream(output, slots, setter));

  return {
    stop: () => proc.terminate(),
  };
}
