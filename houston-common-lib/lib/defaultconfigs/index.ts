// One template for every chassis: the vdev layout is planned at runtime from the
// drives actually present (see managers/zfs/layout.ts), not baked in per model.
import smbconf from "./smb.conf?raw";
import zfsconf from "./zfs.json";

export { smbconf, zfsconf }