export interface basePoolData{
	name: string;
	vdevs: vDevData[];
}
//object for vdev
export interface vDevData extends basevDevData {
	name: string;
	// type: 'disk' | 'mirror' | 'raidz1' | 'raidz2' | 'raidz3' | 'cache' | 'log' | 'dedup' | 'special' | 'spare';
	status: string;
	guid: string;
	stats: {
		read_errors: number;
		write_errors: number;
		checksum_errors: number;
	};
	selectedDisks: string[];
	forceAdd?: boolean;
	poolName?: string;
	isMirror?: boolean;
	diskType?: 'SSD' | 'HDD' | 'NVMe' | 'Hybrid' | unknown;
	diskIdentifier?: DiskIdentifier;
	errors?: string[];
	path?: string;
}

export interface basevDevData{
	type: string;
	disks: DiskData[];

}
export interface baseDiskData{
	name: string;
	capacity: string;
	model: string;
	guid: string;
	type: string;
	health: string;
	stats: Record<string, any>;
	path: string;
	phy_path: string;
	sd_path: string;
	vdev_path: string;
	serial: string;
	temp: string;
	powerOnCount: string;
	powerOnHours: number;
	rotationRate: number;
}
//pool object for creating new pool command
export interface newPoolData {
	name: string;
	vdevs: newVDevData[];
	autoexpand: string;
	autoreplace: string;
	autotrim: string;
	compression: string;
	recordsize: number;
	sectorsize: number;
	dedup: string;
	forceCreate?: boolean;
	refreservationPercent: number;
}

export interface PoolData extends basePoolData {
	status: string;
	guid: string;
	properties: {
		rawsize: number;
		size: string;
		capacity: number;
		allocated: string;
		free: string;
		readOnly: boolean;
		sector: string;
		record: string;
		compression: boolean;
		deduplication: boolean;
		refreservationPercent?: number;
		refreservationRawSize?: number;
		autoExpand: boolean;
		autoReplace: boolean;
		autoTrim: boolean;
		available: number;
		forceCreate?: boolean;
		delegation?: boolean;
		listSnapshots?: boolean;
		// multiHost?: boolean;
		health?: string;
		altroot?: string;
		upgradable?: boolean;
	}
	createFileSystem?: boolean;
	fileSystem?: FileSystemData;
	datasets?: any;
	errors?: string[];
	statusCode: string | null;
	statusDetail: string | null;
	comment?: string;
	failMode?: 'wait' | 'continue' | 'panic';
	diskType?: 'SSD' | 'HDD' | 'Hybrid';
	scan?: PoolScanObject;
	diskIdentifier?: DiskIdentifier;
	errorCount: number;
}
export interface newVDevData {
	type: string;
	disks: string[];
	isMirror?: boolean;
	forceAdd?: boolean;
}

//dataset command data object
export interface NewDataset {
	name: string;
	parent: string;
	encrypted: boolean;
	encryption?: string;
	atime: string;
	casesensitivity: string;
	compression: string;
	dedup: string;
	dnodesize: string;
	xattr: string;
	recordsize: string;
	quota: string;
	readonly: string;
}


export type DiskIdentifier = 'vdev_path' | 'phy_path' | 'sd_path';

//object for disk
export interface DiskData extends baseDiskData{
	
	vDevName?: string;
	poolName?: string;
	identifier?: DiskIdentifier;
	children?: ChildDiskData[];
	vDevType?: 'data' | 'cache' | 'log' | 'dedup' | 'special' | 'spare';
	errors?: string[];
	hasPartitions?: boolean;
}

export interface ChildDiskData {
	name: string;
	guid: string;
	path: string;
	stats: Record<string, any>;
	status: string;
	type: string;
	children?:[];
	vDevType?: 'data' | 'cache' | 'log' | 'dedup' | 'special' | 'spare';
}

//object for filesystem
export interface FileSystemData {
	name: string;
	id: string;
	mountpoint: string;
	pool: string;
	encrypted: boolean;
	key_loaded: string;
	type: string;
	inherit: boolean;
	passphrase?: string;
	properties: {
		guid: string;
		encryption: string;
		accessTime: string;
		caseSensitivity: string;
		compression: string;
		deduplication: string;
		dNodeSize: string;
		extendedAttributes: string;
		recordSize: string;
		quota: {
			raw: number;
			value: string;
			unit: 'kib' | 'mib' | 'gib' | 'tib';
		}
		isReadOnly?: boolean;
		readOnly: string;
		available: number;
		creation: string;
		snapshotCount: string;
		mounted: string;
		usedbyRefreservation: string;
		usedByDataset: string;
		canMount?: string;
		aclInheritance?: string;
		aclType?: string;
		checksum?: string;
		refreservation?: {
			raw: number;
			value: string;
			unit: 'kib' | 'mib' | 'gib' | 'tib';
		}
		used: number;
	},
	children?: FileSystemData[];
	parentFS?: string;
}

//object for tracking pool scan (scrub/resilver) data
export interface PoolScanObject {
	name?: string;
	function: string;
	start_time: string;
	end_time: string;
	state: string;
	errors: number;
	percentage: number;
	pause: string;
	total_secs_left: number;
	bytes_issued: number;
	bytes_processed: number;
	bytes_to_process: number;
}
