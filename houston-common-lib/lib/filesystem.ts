export type FilesystemType = "zfs" | "ceph" | "cifs" | "other";

export const parseFileSystemType = (type: string): FilesystemType => {
  switch (type) {
    case "zfs":
      return "zfs";
    case "ceph":
      return "ceph";
    case "cifs":
      return "cifs";
    default:
      return "other";
  }
};

export type Filesystem = {
  source: string;
  type: FilesystemType;
};

export type FilesystemMount = {
  filesystem: Filesystem;
  mountpoint: string;
};
