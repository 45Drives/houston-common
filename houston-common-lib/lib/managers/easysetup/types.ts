import { SambaConfig } from "../samba/types";
import { ZFSConfig } from "../zfs/types";

export type EasySetupConfig = {
  zfsConfig?: ZFSConfig
  sambaConfig?: SambaConfig
  smbUser?: string
  smbPass?: string
  srvrName?: string
  folderName?: string
};

export interface BackupLogEntry {
  serverName: string;
  shareName: string;
  setupTime: string; // ISO string (formatted)
}

export interface BackupLog {
  [ipAddress: string]: BackupLogEntry;
}