import {
  ZpoolCreateOptions,
  ZPool,
  Server,
  Command,
  ZPoolBase,
  VDev,
  ValueError,
  unwrap,
  CommandOptions,
  ZPoolAddVDevOptions,
  DatasetCreateOptions,
  Disks,
  VDevDisk,
  ZPoolDestroyOptions,
  convertToBytes,
  ExitedProcess, 
  formatBytes,
  Dataset,
  Snapshot
} from "@/index";

export interface IZFSManager {
  createPool(pool: ZPoolBase, options: ZpoolCreateOptions): Promise<ExitedProcess>;
  destroyPool(name: string): Promise<void>;
  addVDevsToPool(pool: ZPoolBase, vdevs: VDev[], options: ZPoolAddVDevOptions): Promise<ExitedProcess>;
  addDataset(parent: string, name: string, options: DatasetCreateOptions): Promise<ExitedProcess>;
  getBaseDisks(): Promise<VDevDisk[]>;
  getFullDisks(): Promise<VDevDisk[]>;
  getDiskCapacity(path: string): Promise<string>;
  // TODO:
  getPools(): Promise<ZPool[]>;
  getDatasets(): Promise<Dataset[]>;
  getSnapshots(filesystem: string): Promise<Snapshot[]>;
  createSnapshot(): Promise<void>;
  destroySnapshot(): Promise<void>;
  rollbackSnapshot(): Promise<void>;
}

export class ZFSManager implements IZFSManager {
  private commandOptions: CommandOptions;

  constructor(protected server: Server = new Server()) {
    this.commandOptions = { superuser: "try" };
  }


  // private pickDiskPath(disk: VDevDisk, ident?: 'vdev_path' | 'phy_path' | 'sd_path' | 'wwn_path'): string {
  //   const bad = (s?: string) => !s || s === 'N/A' || s.toLowerCase?.() === 'unknown';

  //   switch (ident) {
  //     case 'wwn_path':
  //       if (!bad(disk.wwn_path)) return disk.wwn_path!;
  //       if (!bad(disk.sd_path)) return disk.sd_path!;
  //       if (!bad(disk.vdev_path)) return disk.vdev_path!;
  //       if (!bad(disk.phy_path)) return disk.phy_path!;
  //       break;
  //     case 'phy_path':
  //       if (!bad(disk.phy_path)) return disk.phy_path!;
  //       if (!bad(disk.sd_path)) return disk.sd_path!;
  //       if (!bad(disk.vdev_path)) return disk.vdev_path!;
  //       break;
  //     case 'sd_path':
  //       if (!bad(disk.sd_path)) return disk.sd_path!;
  //       if (!bad(disk.vdev_path)) return disk.vdev_path!;
  //       if (!bad(disk.phy_path)) return disk.phy_path!;
  //       break;
  //     case 'vdev_path':
  //     default:
  //       if (disk.type === 'NVMe' && !bad(disk.sd_path)) return disk.sd_path!;
  //       if (!bad(disk.vdev_path)) return disk.vdev_path!;
  //       if (!bad(disk.sd_path)) return disk.sd_path!;
  //       if (!bad(disk.phy_path)) return disk.phy_path!;
  //   }
  //   return '';
  // }
  
  /**
   * Transform vdev into command args for zpool create or zpool add
   * @param vdev
   * @returns
   */
  private formatVDevArgv(vdev: VDev): string[] {
    const args = [];
    if (vdev.type !== "disk") {
      args.push(vdev.type);
    }
    if (vdev.isMirror) {
      if (!["log", "special", "dedup"].includes(vdev.type)) {
        throw new ValueError(`${vdev.type} vdev cannot be mirrored!`);
      }
      args.push("mirror");
    }

    // Filter out invalid paths and replace NVMe vdev_path with sd_path
    const validDisks = vdev.disks
      .map((disk) => (disk.path && disk.path !== "N/A") ? disk.path : (disk.sd_path ?? ""))
      .filter((path): path is string => path !== "N/A" && path !== ""); // Type assertion to remove undefined values
    if (validDisks.length === 0) {
      throw new ValueError(`VDev of type ${vdev.type} has no valid disks!`);
    }

    // args.push(...vdev.disks.map((disk) => disk.path));
    args.push(...validDisks);

    return args;
  }

  // private formatVDevArgv(vdev: VDev): string[] {
  //   const args: string[] = [];
  //   if (vdev.type !== "disk") args.push(vdev.type);
  //   if (vdev.isMirror) {
  //     if (!["log", "special", "dedup"].includes(vdev.type)) {
  //       throw new ValueError(`${vdev.type} vdev cannot be mirrored!`);
  //     }
  //     args.push("mirror");
  //   }

  //   const ident = (vdev as any).diskIdentifier as ('vdev_path' | 'phy_path' | 'sd_path' | 'wwn_path' | undefined);
  //   const paths = vdev.disks.map(d => this.pickDiskPath(d, ident)).filter(p => p && p !== 'N/A');

  //   if (paths.length !== vdev.disks.length) {
  //     throw new ValueError(`VDev ${vdev.type} has disks without a valid path for "${ident ?? 'vdev_path'}"`);
  //   }

  //   args.push(...paths);
  //   return args;
  // }

  /**
   * Transform array of vdevs into command args for zpool create or zpool add
   * @param vdevs
   * @returns
   */
  private formatVDevsArgv(vdevs: VDev[]): string[] {
    return vdevs
      .sort((a, b) => {
        // ensure stripe vdevs come first since they have no type argument
        if (a.type === b.type) {
          return 0;
        }
        if (a.type === "disk") {
          return -1;
        }
        return 1;
      })
      .flatMap((vdev) => this.formatVDevArgv(vdev));
  }

  async createPool(pool: ZPoolBase, options: ZpoolCreateOptions): Promise<ExitedProcess> {
    const argv = ["zpool", "create", pool.name];

    console.log('createPool pool:', pool);
    console.log('createPool poolOptions:', pool);
    
    // set up pool properties
    const poolProps: string[] = [];

    if (options.sectorsize !== undefined) poolProps.push(`ashift=${options.sectorsize}`);
    if (options.autoexpand !== undefined) poolProps.push(`autoexpand=${options.autoexpand}`);
    if (options.autoreplace !== undefined) poolProps.push(`autoreplace=${options.autoreplace}`);
    if (options.autotrim !== undefined) poolProps.push(`autotrim=${options.autotrim}`);

    // pool props are ['-o', 'prop=value']
    argv.push(...poolProps.flatMap((prop) => ["-o", prop]));

    // set up filesystem properties
    const fsProps: string[] = [
      "aclinherit=passthrough",
      "acltype=posixacl",
      "casesensitivity=sensitive",
      "normalization=formD",
      "sharenfs=off",
      "sharesmb=off",
      "utf8only=on",
      "xattr=sa",
    ];

    if (options.compression !== undefined) fsProps.push(`compression=${options.compression}`);
    if (options.recordsize !== undefined) fsProps.push(`recordsize=${options.recordsize}`);
    if (options.dedup !== undefined) fsProps.push(`dedup=${options.dedup}`);

    // Handle refreservation
    if (options.refreservationPercent !== undefined) {
      // Estimate total disk capacity from all vdevs
      const totalBytes = pool.vdevs.flatMap(v => v.disks)
        .map(disk => convertToBytes(disk.capacity ?? "0"))
        .reduce((acc, curr) => acc + curr, 0);

      const fraction = Math.min(Math.max(options.refreservationPercent, 0), 100) / 100;
      const refreservationBytes = Math.floor(totalBytes * fraction);
      fsProps.push(`refreservation=${refreservationBytes}`);
    }

    // fs props are ['-O', 'prop=value']
    argv.push(...fsProps.flatMap((prop) => ["-O", prop]));

    if (options.forceCreate) argv.push("-f");

    // add in vdevs
    argv.push(...this.formatVDevsArgv(pool.vdevs));

    console.log("****\ncmdstring:\n", ...argv, "\n****");

    // using new process execution method instead of useSpawn
    // console.log(proc.getStdout());
    try {
      const proc = await unwrap(this.server.execute(new Command(argv, this.commandOptions)));
      console.log("Command output:", proc.getStdout());
      return proc;  // Return the process result
    } catch (error) {
      console.error("Error executing command:", error);
      throw error; // Ensure caller catches the error
    }
  }

  async destroyPool(pool: ZPoolBase | string, options: ZPoolDestroyOptions = {}): Promise<void> {
    const poolName = typeof pool === "string" ? pool : pool.name;
    const argv = ["zpool", "destroy"]

    if (options.force) {
      argv.push("-f");
    }

    argv.push(poolName);

    await unwrap(
      this.server.execute(new Command(argv, this.commandOptions))
    );
  }

  async getPools(): Promise<ZPool[]> {
    // TODO
    return [];
  }

  async getDatasets(): Promise<Dataset[]> {
    // TODO
    return [];
  }

  /**
   * List all snapshots under a filesystem (recursively).
   */
  async getSnapshots(filesystem: string): Promise<Snapshot[]> {
    const argv = [
      "zfs", "list", "-H",
      "-t", "snapshot",
      "-o", "name,guid,creation",
      "-r", filesystem,
      "-p"        // raw numeric output for creation (seconds since epoch)
    ];
    const proc = await unwrap(
      this.server.execute(new Command(argv, this.commandOptions))
    );
    return proc.getStdout()
      .trim()
      .split("\n")
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split("\t");
        if (parts.length < 3) {
          throw new Error(`malformed zfs output: ${line}`);
        }
        const name = parts[0]!;
        const guid = parts[1]!;
        const creationSec = parts[2];
        return {
          name,
          guid,
          creation: new Date(+creationSec! * 1000),
        };
      });
  }


  /**
   * Given two snapshot lists, find the most recent common one by GUID.
   */
  getMostRecentCommonSnap(
    sourceSnaps: Snapshot[],
    destSnaps: Snapshot[]
  ): Snapshot | null {
    const destByGuid = new Map(destSnaps.map(s => [s.guid, s] as const));
    const commons = sourceSnaps
      .filter(s => destByGuid.has(s.guid))
      .sort((a, b) => b.creation.getTime() - a.creation.getTime());
    return commons.length > 0 ? commons[0]! : null;
  }

  /**
   * Send a snapshot locally (or incrementally from a base snapshot).
   */
  async sendSnapshot(
    sendName: string,
    options: {
      incrementalFrom?: string;
      compressed?: boolean;
      raw?: boolean;
    } = {}
  ): Promise<ExitedProcess> {
    const argv = ["zfs", "send"];
    if (options.compressed) argv.push("-Lce");
    if (options.raw) argv.push("-w");
    if (options.incrementalFrom) {
      argv.push("-i", options.incrementalFrom);
    }
    argv.push(sendName);
    return unwrap(
      this.server.execute(new Command(argv, this.commandOptions))
    );
  }

  /**
   * Receive a stream into a given dataset name.
   */
  async receiveSnapshot(
    recvName: string,
    options: { forceOverwrite?: boolean } = {}
  ): Promise<ExitedProcess> {
    const argv = ["zfs", "recv"];
    if (options.forceOverwrite) argv.push("-F");
    argv.push(recvName);
    return unwrap(
      this.server.execute(new Command(argv, this.commandOptions))
    );
  }

  async createSnapshot(): Promise<void> {
    // TODO
  }

  async destroySnapshot(): Promise<void> {
    // TODO                                               
  }


  async rollbackSnapshot(): Promise<void> {
    // TODO
  }

  /**
   * Fetches only the disk paths and returns them as VDevDisk[]
   */
  async getBaseDisks(): Promise<VDevDisk[]> {
    return unwrap(
      this.server.getDriveSlots({ excludeEmpty: true }).map((slots) =>
        slots.map((slot): VDevDisk => ({
          // path: slot.drive.path,
          path: `/dev/disk/by-vdev/${slot.slotId}`
        }))
      )
    );
  }


  /**
   * Fetches full disk information by merging fetchLsdev() and fetchDiskInfo()
   */
  async getFullDisks(): Promise<VDevDisk[]> {
    return unwrap(
      this.server.getDriveSlots({ excludeEmpty: true }).map((slots) =>
        slots.map((slot): VDevDisk => {
          const drive = slot.drive;

          return {
            path: `/dev/disk/by-vdev/${slot.slotId}`,
            name: slot.slotId,
            capacity: formatBytes(drive.capacity, "both"),
            model: drive.model,
            guid: drive.serial,
            type: drive.rotationRate ? "HDD" : "SSD",
            health: drive.smartInfo?.health ?? "Unknown",
            stats: {},
            phy_path: drive.pathByPath,
            sd_path: drive.path,
            vdev_path: `/dev/disk/by-vdev/${slot.slotId}`,
            serial: drive.serial,
            temp: drive.smartInfo ? this.formatTemperature(drive.smartInfo.temperature) : "N/A",
            powerOnCount: drive.smartInfo?.powerCycleCount?.toString() ?? "0",
            powerOnHours: drive.smartInfo?.powerOnHours ?? 0,
            rotationRate: drive.rotationRate ?? 0,
          };
        })
      )
    ).catch((error) => {
      console.error("Error fetching full disks:", error);
      return [];
    });
  }

  private formatTemperature(tempC: number): string {
    return `${tempC}°C / ${(tempC * 9) / 5 + 32}°F`;
  }

  /**
   * Fetches the capacity of a specific disk given its path
   */
  async getDiskCapacity(path: string): Promise<string> {
    const { fetchLsdev } = Disks;
    return fetchLsdev()
      .map((lsdevData) => {
        const lsdevRows = lsdevData.rows.flat(); // Flatten nested arrays in `lsdev`
        const disk = lsdevRows.find((lsdev: any) => lsdev["dev-by-path"] === path);
        return disk?.capacity || "Unknown";
      })
      .unwrapOr("Unknown");
  }

  async addVDevsToPool(pool: ZPoolBase, vdevs: VDev[], options: ZPoolAddVDevOptions): Promise<ExitedProcess> {
    const argv = ["zpool", "add"];

    if (options.force) argv.push("-f");

    argv.push(pool.name);

    // add in vdevs
    argv.push(...this.formatVDevsArgv(vdevs));

    console.log("****\ncmdstring:\n", ...argv, "\n****");

    // using new process execution method instead of useSpawn

    try {
      const proc = await unwrap(this.server.execute(new Command(argv, this.commandOptions)));
      console.log("Command output:", proc.getStdout());
      return proc;  // Return the process result
    } catch (error) {
      console.error("Error executing command:", error);
      throw error; // Ensure caller catches the error
    }
  }

  async addDataset(parent: string, name: string, options: DatasetCreateOptions): Promise<ExitedProcess> {
    const argv = ["zfs", "create"];
    const datasetProps: string[] = [];

    if (options.atime !== undefined) datasetProps.push(`atime=${options.atime}`);
    if (options.casesensitivity !== undefined) datasetProps.push(`casesensitivity=${options.casesensitivity}`);
    if (options.compression !== undefined) datasetProps.push(`compression=${options.compression}`);
    if (options.dedup !== undefined) datasetProps.push(`dedup=${options.dedup}`);
    if (options.dnodesize !== undefined) datasetProps.push(`dnodesize=${options.dnodesize}`);
    if (options.xattr !== undefined) datasetProps.push(`xattr=${options.xattr}`);
    if (options.recordsize !== undefined) datasetProps.push(`recordsize=${options.recordsize}`);
    if (options.readonly !== undefined) datasetProps.push(`readonly=${options.readonly}`);
    if (options.quota !== undefined) {
      datasetProps.push(`quota=${options.quota === "0" ? "none" : options.quota}`);
    }

    argv.push(...datasetProps.flatMap((prop) => ["-o", prop]));
    argv.push(`${parent}/${name}`);

    console.log("****\ncmdstring:\n", ...argv, "\n****");

    try {
      const proc = await unwrap(this.server.execute(new Command(argv, this.commandOptions)));
      console.log("Command output:", proc.getStdout());
      return proc;  // Return the process result
    } catch (error) {
      console.error("Error executing command:", error);
      throw error; // Ensure caller catches the error
    }
  }


  allDisksHaveSameCapacity(disks: VDevDisk[]): boolean {
    if (disks.length === 0) return false;
    const firstCapacity = convertToBytes(disks[0]!.capacity!);
    return disks.every(disk => (convertToBytes(disk.capacity!) === firstCapacity));
  }

  RAIDZResiliency: Record<string, number> = {
    "raidz1": 1, // Can lose 1 disk
    "raidz2": 2, // Can lose 2 disks
    "raidz3": 3  // Can lose 3 disks
  };

  OptimalRAIDZLevel: Record<number, string> = {
    4: "raidz1",
    8: "raidz2",
    20: "raidz2",
    30: "raidz3"
  };

}