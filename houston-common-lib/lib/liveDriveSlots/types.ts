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
};

export type LiveDriveSlotsHandle = {
  stop: () => void;
}
