import { SambaConfig } from "../samba/types";
import { ZFSConfig } from "../zfs/types";

export type EasySetupConfig = {
  zfsConfigs?: ZFSConfig[]
  sambaConfig?: SambaConfig
  smbUser?: string
  smbPass?: string
  srvrName?: string
  folderName?: string
  serverConfig?: ServerInfoConfig;
  usersAndGroups?: UsersAndGroupsConfig;
  /** If true, skip destruction of existing ZFS pools and Samba shares (step 3) */
  skipClearExisting?: boolean;
  /** If true, erase every configured drive before creating pools */
  wipeDrives?: boolean;
  /**
   * "quick" clears partition tables and filesystem/ZFS/RAID signatures only.
   * "full" additionally erases every block via NVMe format, discard, or a zero overwrite.
   * Defaults to "quick".
   */
  wipeMode?: "quick" | "full";
};

export type BackupLogEntry = {
  serverName: string;
  shareName: string;
  setupTime: string; // ISO string (formatted)
}

export type BackupLog = {
  [ipAddress: string]: BackupLogEntry;
}

export type ServerInfoConfig = {
  adminUser: string;
  adminPass: string;
  /** Opt-in hardening; root SSH is left as the OS shipped it unless this is true. */
  disableRootSSH: boolean;
  changeRootPassword?: boolean;
  newRootPass?: string;
  timezone?: string;
  setTimezone?: boolean;
  useNTP?: boolean;
};

export type UserSpec = {
  username: string;
  password: string;
  groups: string[];
  sshKey?: string;
};

export type GroupSpec = {
  name: string;
  members?: string[];
};

export type UsersAndGroupsConfig = {
  users: UserSpec[];
  groups: GroupSpec[];
};