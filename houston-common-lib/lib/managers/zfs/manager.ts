import {
  ZpoolCreateOptions,
  ZPool,
  Server,
  Command,
  ZPoolBase,
  VDevBase,
  ValueError,
  unwrap,
  CommandOptions,
  ZPoolAddVDevOptions,
  DatasetCreateOptions,
  Dataset,
} from "@/index";

export interface IZFSManager {
  createPool(pool: ZPoolBase, options: ZpoolCreateOptions): Promise<void>;
  destroyPool(name: string): Promise<void>;
  addVDevsToPool(pool: ZPoolBase, vdevs: VDevBase[], options: ZPoolAddVDevOptions): Promise<void>;
  
  // TODO:

  getPools(): Promise<ZPool[]>;
  addDataset(parent: ZPoolBase | Dataset, name: string, options: DatasetCreateOptions): Promise<void>;
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
  private formatVDevArgv(vdev: VDevBase): string[] {
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
    args.push(...vdev.disks.map((disk) => disk.path));
    return args;
  }

  /**
   * Transform array of vdevs into command args for zpool create or zpool add
   * @param vdevs
   * @returns
   */
  private formatVDevsArgv(vdevs: VDevBase[]): string[] {
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

  async createPool(pool: ZPoolBase, options: ZpoolCreateOptions): Promise<void> {
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
    const proc = await unwrap(this.server.execute(new Command(argv, this.commandOptions)));

    console.log(proc.getStdout());
  }

  async destroyPool(pool: ZPoolBase | string): Promise<void> {
    const poolName = typeof pool === "string" ? pool : pool.name;
    await unwrap(
      this.server.execute(new Command(["zpool", "destroy", poolName], this.commandOptions))
    );
  }

  async getPools(): Promise<ZPool[]> {
    // TODO
    return [];
  }

  async addVDevsToPool(pool: ZPoolBase, vdevs: VDevBase[], options: ZPoolAddVDevOptions): Promise<void> {
    const argv = ["zpool", "add"];

    if (options.force) argv.push("-f");

    argv.push(pool.name);

    // add in vdevs
    argv.push(...this.formatVDevsArgv(vdevs));

    console.log("****\ncmdstring:\n", ...argv, "\n****");

    // using new process execution method instead of useSpawn
    const proc = await unwrap(this.server.execute(new Command(argv, this.commandOptions)));

    console.log(proc.getStdout());
  }

  async addDataset(parent: ZPoolBase | Dataset, name: string, options: DatasetCreateOptions): Promise<void> {
    const argv = ["zfs", "create"];

    // Construct dataset properties
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

    // Append properties to command arguments
    argv.push(...datasetProps.flatMap((prop) => ["-o", prop]));

    // Append dataset path
    argv.push(`${parent.name}/${name}`);

    console.log("****\ncmdstring:\n", ...argv, "\n****");

    // Execute command
    const proc = await unwrap(this.server.execute(new Command(argv, this.commandOptions)));

    console.log(proc.getStdout());
  }
}


