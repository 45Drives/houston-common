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
  ExitedProcess
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

}

export class ZFSManager implements IZFSManager {
  private commandOptions: CommandOptions;

  constructor(protected server: Server = new Server()) {
    this.commandOptions = { superuser: "try" };
  }

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


  /**
   * Fetches only the disk paths and returns them as VDevDisk[]
   */
  async getBaseDisks(): Promise<VDevDisk[]> {
    return unwrap(
      this.server.getDiskInfo()
        .map((diskInfoData) =>
          diskInfoData.rows!.map((disk: any): VDevDisk => ({
            path: disk["dev"],
          }))
        )
    );
  }

  /**
   * Fetches full disk information by merging fetchLsdev() and fetchDiskInfo()
   */
  async getFullDisks(): Promise<VDevDisk[]> {
    return Promise.all([
      unwrap(this.server.getLsDev()),
      unwrap(this.server.getDiskInfo()),
    ])
      .then(([lsdevData, diskInfoData]) => {
        const lsdevRows = lsdevData.rows.flat(); // Flatten nested arrays in `lsdev`
        const diskInfoRows = diskInfoData.rows!;
        // console.log('lsdevRows:', lsdevRows);
        // console.log('diskInfoRows:', diskInfoRows);
        return diskInfoRows.map((disk: any): VDevDisk => {
          const matchingDisk = lsdevRows.find((lsdev: any) => lsdev.dev === disk.dev);

          return {
            path: `/dev/disk/by-vdev/${disk["bay-id"]}`,
            name: matchingDisk?.["bay-id"] || "Unknown",
            capacity: matchingDisk?.capacity || "Unknown",
            model: matchingDisk?.["model-name"] || "Unknown",
            guid: matchingDisk?.serial || "Unknown",
            type: (matchingDisk?.disk_type as "SSD" | "HDD" | "NVMe") || "HDD",
            health: matchingDisk?.health || "Unknown",
            stats: {},
            phy_path: disk["dev-by-path"],
            sd_path: disk.dev,
            vdev_path: `/dev/disk/by-vdev/${disk["bay-id"]}`,
            serial: matchingDisk?.serial || "Unknown",
            temp: matchingDisk?.["temp-c"] || "N/A",
            powerOnCount: matchingDisk?.["power-cycle-count"] || "0",
            powerOnHours: Number(matchingDisk?.["power-on-time"]) || 0,
            rotationRate: Number(matchingDisk?.["rotation-rate"]) || 0,
          };
        });
      })
      .catch((error) => {
        console.error("Error fetching full disks:", error);
        return [];
      });
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