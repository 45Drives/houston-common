import { SambaConfig } from "../samba/types";
import { ZFSConfig } from "../zfs/types";

export type EasySetupConfig = {
  zfsConfigs?: ZFSConfig[]
  sambaConfig?: SambaConfig
  smbUser?: string
  smbPass?: string
  srvrName?: string
  folderName?: string
  splitPools?: boolean
};

export type BackupLogEntry = {
  serverName: string;
  shareName: string;
  setupTime: string; // ISO string (formatted)
}

export type BackupLog = {
  [ipAddress: string]: BackupLogEntry;
}