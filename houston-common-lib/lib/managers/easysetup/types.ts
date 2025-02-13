import { SambaConfig } from "../samba/types";
import { ZFSConfig } from "../zfs/types";

export type EasySetupConfig = {
  zfsConfig: ZFSConfig
  sambaConfig: SambaConfig
  smbUser: string
  smbPass: string
  folderName: string
  srvrName: string
};
