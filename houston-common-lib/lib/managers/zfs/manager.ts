import { ZpoolCreateOptions, ZPool, Server, Command, ZPoolBase, VDevBase } from '@/index';

export interface IZFSManager {
    createPool(options: ZpoolCreateOptions): Promise<ZPool>;
    getPools(): Promise<ZPool[]>;
    addVDevToPool(pool:ZPoolBase, vdev: VDevBase)
}
