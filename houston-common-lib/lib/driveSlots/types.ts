import { formatBytes } from "@/utils";

export type DriveSlot = {
  slotId: string;
  drive: Drive | null;
};

export type Drive = {
  /**
   * drive capacity in bytes
   */
  capacity: number;
  /**
   * model number
   */
  model: string;
  /**
   * serial number
   */
  serial: string;
  /**
   * rotational rate RPM if HDD
   * if SSD, = 0
   */
  rotationRate: number;
  /**
   * /dev/sd* path
   */
  path: string;
  /**
   * /dev/disk/by-path/* path
   */
  pathByPath: string;
  firmwareVersion: string;
  partitionCount: number;
  /**
   * smartctl info if user can access
   */
  smartInfo: SmartInfo | null;
};

export type SmartInfo = {
  modelFamily: string;
  startStopCount: number;
  powerOnHours: number;
  powerCycleCount: number;
  /**
   * celsius
   */
  temperature: number;
  /**
   * "OK"
   */
  health: string;
  freshness: 'NEW' | 'USED' | 'OLD'
};

function formatTemperature(tempC: number): string {
  return `${tempC}°C / ${(tempC * 9) / 5 + 32}°F`;
}

export namespace DriveSlot {
  export function formatProperties(
    slot: DriveSlot | DriveSlot[]
  ): { label: string; value: string }[] {
    if (Array.isArray(slot)) {
      if (slot.length === 0) {
        return [];
      }
      if (slot.length === 1) {
        return formatProperties(slot[0]!);
      }
      return [
        { label: "Drive Slot", value: "Multiple selected" },
        {
          label: "Capacity",
          value: formatBytes(
            slot.reduce((sum, s) => sum + (s.drive?.capacity ?? 0), 0),
            "both"
          ),
        },
      ];
    }
    const props = [{ label: "Drive Slot", value: slot.slotId }];

    if (slot.drive) {
      props.push(
        { label: "Device Path", value: slot.drive.path },
        { label: "Device Path (by-path)", value: slot.drive.pathByPath },
        { label: "Drive Type", value: slot.drive.rotationRate ? "HDD" : "SSD" },
        { label: "Model Name", value: slot.drive.model },
        { label: "Serial", value: slot.drive.serial },
        { label: "Firmware Version", value: slot.drive.firmwareVersion },
        { label: "Capacity", value: formatBytes(slot.drive.capacity, "both") },
        { label: "Partition Count", value: slot.drive.partitionCount.toString() }
      );
      if (slot.drive.rotationRate) {
        props.push({ label: "Rotation Rate", value: slot.drive.rotationRate.toString() });
      }
      if (slot.drive.smartInfo) {
        props.push(
          {
            label: "Temperature",
            value: formatTemperature(slot.drive.smartInfo.temperature),
          },
          { label: "Power On Time", value: `${slot.drive.smartInfo.powerOnHours} h` },
          { label: "Power Cycle Count", value: slot.drive.smartInfo.powerCycleCount.toString() },
          { label: "Start Stop Count", value: slot.drive.smartInfo.startStopCount.toString() },
          { label: "Health", value: slot.drive.smartInfo.health }
        );
      }
    } else {
      props.push({ label: "Drive Type", value: "Empty" });
    }

    return props;
  }
}

export type GetDriveSlotsOpts = {
  /**
   * exclude empty slots, ensuring slot.drive is always non-null
   * default: false
   */
  excludeEmpty?: boolean;
};

export type LiveDriveSlotsHandle = {
  stop: () => void;
};
