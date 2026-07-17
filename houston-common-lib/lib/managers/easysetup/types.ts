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
  serverConfig?: ServerInfoConfig;
  usersAndGroups?: UsersAndGroupsConfig;
  /** If true, skip destruction of existing ZFS pools and Samba shares (step 3) */
  skipClearExisting?: boolean;
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
  disableRootSSH: boolean;
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