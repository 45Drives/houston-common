import { ZpoolCreateOptions, ZPool, Server, Command, ZPoolBase, VDevBase, VDev } from '@/index';

export interface IZFSManager {
    createPool(options: ZpoolCreateOptions): Promise<ZPool>;
    getPools(): Promise<ZPool[]>;
    addVDevToPool(pool:ZPoolBase, vdev: VDevBase): Promise<VDev>;
}

export class ZFSManager implements IZFSManager {
    constructor(protected server: Server = new Server()) {}

    async createPool(options: ZpoolCreateOptions): Promise<ZPool> {
        
    }

    async getPools(): Promise<ZPool[]> {
        
    }

    async addVDevToPool(pool: ZPoolBase, vdev: VDevBase): Promise<VDev> {
        
    }
}
