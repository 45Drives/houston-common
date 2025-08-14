import { slotsCommand } from "./command";
import { DriveSlot, LiveDriveSlotsHandle, LiveDriveSlotsOpts } from "./types";
import { Process } from "@/process";
import { Server } from "@/server";

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
  retries: number;
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
    if (e instanceof Error) {
      globalThis.reportHoustonError(e);
    }
  }
}

export function startLiveDriveSlotsWatcher(
  server: Server,
  setter: (slots: DriveSlot[]) => void,
  opts?: LiveDriveSlotsOpts
): LiveDriveSlotsHandle {
  const ctx: LiveDriveSlotsCtx = {
    proc: server.spawnProcess(slotsCommand({ live: true, includeNonAliased: opts?.includeNonAliased }), true),
    slots: [],
    stop: false,
    retries: 3,
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
        if (ctx.retries > 0) {
          console.error("Live drive slots watcher died, retrying:", e);
          ctx.retries -= 1;
          start();
        } else {
          globalThis.reportHoustonError(e, "Live drive slots watcher died.");
        }
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
