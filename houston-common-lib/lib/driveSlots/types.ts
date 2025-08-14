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
  // freshness: 'NEW' | 'USED' | 'OLD'
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
        { label: "Manufacturer", value: modelToManufacturer(slot.drive.model) },
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

  function modelToManufacturer(model: string): string {
    const manufacturers: Record<string, string> = {
      "ST": "Seagate",       // Example: ST1000DM003
      "WD": "Western Digital", // Example: WD40EZRX
      "HGST": "HGST",         // Example: HGST HUS726T4TALA6L4
      "SAMSUNG": "Samsung",   // Example: SAMSUNG MZ7LN256HCHP
      "TOSHIBA": "Toshiba",   // Example: TOSHIBA DT01ACA100
      "HITACHI": "Hitachi",   // Example: HITACHI HDS721010CLA332
      "INTEL": "Intel",       // Example: INTEL SSDSC2KW256G8
      "CRUCIAL": "Crucial",   // Example: CRUCIAL CT500MX500SSD1
      "KINGSTON": "Kingston", // Example: KINGSTON SA400S37/240G
      "ADATA": "ADATA",       // Example: ADATA SU800
      "SAN": "SanDisk",       // Example: SanDisk SDSSDH3-500G-G25
      "PLEXTOR": "Plextor",   // Example: PLEXTOR PX-256M9PeG
      "MICRON": "Micron",     // Example: MICRON 1100 SATA 256GB
    };
  
    for (const prefix in manufacturers) {
      if (model.toUpperCase().startsWith(prefix)) {
        return manufacturers[prefix] || "";
      }
    }
  
    return "Unknown Manufacturer";
  };
  
}


export type GetDriveSlotsOpts = {
  /**
   * exclude empty slots, ensuring slot.drive is always non-null
   * default: false
   */
  excludeEmpty?: boolean;
  /**
   * Include drives that aren't in aliased slots, e.g. boot drives
   */
  includeNonAliased?: boolean;
};

export type LiveDriveSlotsOpts = {
  /**
   * Include drives that aren't in aliased slots, e.g. boot drives
   */
  includeNonAliased?: boolean;
}

export type LiveDriveSlotsHandle = {
  stop: () => void;
};
