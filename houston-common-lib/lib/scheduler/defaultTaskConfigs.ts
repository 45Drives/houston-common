/**
 * Default task configuration generators for Easy Setup.
 * Produces JSON configs compatible with Scheduler.importTasksFromConfig().
 */

export interface PoolDatasetRef {
    poolName: string;
    datasetName: string;
}

/**
 * Generate replication task configs (Hourly/Daily/Weekly) for split-pool setups.
 */
export function generateReplicationConfigs(
    source: PoolDatasetRef,
    dest: PoolDatasetRef
): { tasks: any[] } {
    const sourceDataset = `${source.poolName}/${source.datasetName}`;
    const destDataset = `${dest.poolName}/${dest.datasetName}`;

    const baseParams = (srcRetTime: number, srcRetUnit: string, dstRetTime: number, dstRetUnit: string) => ({
        zfsRepConfig_sourceDataset_pool: source.poolName,
        zfsRepConfig_sourceDataset_dataset: sourceDataset,
        zfsRepConfig_destDataset_pool: dest.poolName,
        zfsRepConfig_destDataset_dataset: destDataset,
        zfsRepConfig_sendOptions_compressed_flag: 'false',
        zfsRepConfig_sendOptions_raw_flag: 'false',
        zfsRepConfig_sendOptions_recursive_flag: 'false',
        zfsRepConfig_sendOptions_mbufferSize: '1',
        zfsRepConfig_sendOptions_mbufferUnit: 'G',
        zfsRepConfig_sendOptions_customName_flag: 'false',
        zfsRepConfig_sendOptions_customName: '',
        zfsRepConfig_sendOptions_transferMethod: 'local',
        zfsRepConfig_snapshotRetention_source_retentionTime: String(srcRetTime),
        zfsRepConfig_snapshotRetention_source_retentionUnit: srcRetUnit,
        zfsRepConfig_snapshotRetention_destination_retentionTime: String(dstRetTime),
        zfsRepConfig_snapshotRetention_destination_retentionUnit: dstRetUnit,
    });

    return {
        tasks: [
            {
                name: 'ActiveBackup_HourlyForADay',
                template: 'ZfsReplicationTask',
                parameters: baseParams(1, 'days', 1, 'days'),
                schedule: {
                    enabled: true,
                    intervals: [{
                        minute: { value: '0' },
                        hour: { value: '*' },
                        day: { value: '*' },
                        month: { value: '*' },
                        year: { value: '*' },
                    }],
                },
                notes: 'Take snapshots hourly and save for a day.',
            },
            {
                name: 'ActiveBackup_DailyForAWeek',
                template: 'ZfsReplicationTask',
                parameters: baseParams(1, 'weeks', 1, 'weeks'),
                schedule: {
                    enabled: true,
                    intervals: [{
                        minute: { value: '0' },
                        hour: { value: '0' },
                        day: { value: '*' },
                        month: { value: '*' },
                        year: { value: '*' },
                    }],
                },
                notes: 'Take snapshots daily and save for a week.',
            },
            {
                name: 'ActiveBackup_WeeklyForAMonth',
                template: 'ZfsReplicationTask',
                parameters: baseParams(1, 'months', 1, 'months'),
                schedule: {
                    enabled: true,
                    intervals: [{
                        minute: { value: '0' },
                        hour: { value: '0' },
                        day: { value: '*' },
                        month: { value: '*' },
                        year: { value: '*' },
                        dayOfWeek: ['Fri'],
                    }],
                },
                notes: 'Take snapshots weekly and save for a month.',
            },
        ],
    };
}

/**
 * Generate auto-snapshot task configs (Hourly/Daily/Weekly) for single-pool setups.
 */
export function generateSnapshotConfigs(
    pool: PoolDatasetRef
): { tasks: any[] } {
    const filesystem = `${pool.poolName}/${pool.datasetName}`;

    const baseParams = (retTime: number, retUnit: string) => ({
        autoSnapConfig_filesystem_pool: pool.poolName,
        autoSnapConfig_filesystem_dataset: filesystem,
        autoSnapConfig_recursive_flag: 'false',
        autoSnapConfig_customName_flag: 'false',
        autoSnapConfig_customName: '',
        autoSnapConfig_snapshotRetention_retentionTime: String(retTime),
        autoSnapConfig_snapshotRetention_retentionUnit: retUnit,
    });

    return {
        tasks: [
            {
                name: 'AutoSnapshot_HourlyForADay',
                template: 'AutomatedSnapshotTask',
                parameters: baseParams(1, 'days'),
                schedule: {
                    enabled: true,
                    intervals: [{
                        minute: { value: '0' },
                        hour: { value: '*' },
                        day: { value: '*' },
                        month: { value: '*' },
                        year: { value: '*' },
                    }],
                },
                notes: 'Take snapshots every hour and keep them for 1 day.',
            },
            {
                name: 'AutoSnapshot_DailyForAWeek',
                template: 'AutomatedSnapshotTask',
                parameters: baseParams(1, 'weeks'),
                schedule: {
                    enabled: true,
                    intervals: [{
                        minute: { value: '0' },
                        hour: { value: '0' },
                        day: { value: '*' },
                        month: { value: '*' },
                        year: { value: '*' },
                    }],
                },
                notes: 'Take snapshots daily and keep them for 1 week.',
            },
            {
                name: 'AutoSnapshot_WeeklyForAMonth',
                template: 'AutomatedSnapshotTask',
                parameters: baseParams(1, 'months'),
                schedule: {
                    enabled: true,
                    intervals: [{
                        minute: { value: '0' },
                        hour: { value: '0' },
                        day: { value: '*' },
                        month: { value: '*' },
                        year: { value: '*' },
                        dayOfWeek: ['Fri'],
                    }],
                },
                notes: 'Take snapshots every Friday and keep them for 1 month.',
            },
        ],
    };
}

/**
 * Generate scrub task configs for one or two pools.
 */
export function generateScrubConfigs(
    storagePool: PoolDatasetRef,
    backupPool?: PoolDatasetRef
): { tasks: any[] } {
    const tasks: any[] = [
        {
            name: 'WeeklyScrub',
            template: 'ScrubTask',
            parameters: {
                scrubConfig_pool_pool: storagePool.poolName,
                scrubConfig_pool_dataset: storagePool.poolName,
            },
            schedule: {
                enabled: true,
                intervals: [{
                    minute: { value: '0' },
                    hour: { value: '0' },
                    day: { value: '*' },
                    month: { value: '*' },
                    year: { value: '*' },
                    dayOfWeek: ['Fri'],
                }],
            },
            notes: 'Scrub storage pool weekly to ensure data integrity.',
        },
    ];

    if (backupPool) {
        tasks.push({
            name: 'WeeklyScrub-Backup',
            template: 'ScrubTask',
            parameters: {
                scrubConfig_pool_pool: backupPool.poolName,
                scrubConfig_pool_dataset: backupPool.poolName,
            },
            schedule: {
                enabled: true,
                intervals: [{
                    minute: { value: '0' },
                    hour: { value: '0' },
                    day: { value: '*' },
                    month: { value: '*' },
                    year: { value: '*' },
                    dayOfWeek: ['Fri'],
                }],
            },
            notes: 'Scrub backup pool weekly to ensure data integrity.',
        });
    }

    return { tasks };
}

/**
 * Generate all default setup task configs for a given pool configuration.
 * For splitPools: replication + scrub tasks.
 * For single pool: snapshot + scrub tasks.
 */
export function generateAllDefaultConfigs(opts: {
    splitPools: boolean;
    storagePool: PoolDatasetRef;
    backupPool?: PoolDatasetRef;
}): { tasks: any[] } {
    const allTasks: any[] = [];

    if (opts.splitPools && opts.backupPool) {
        const rep = generateReplicationConfigs(opts.storagePool, opts.backupPool);
        const scrub = generateScrubConfigs(opts.storagePool, opts.backupPool);
        allTasks.push(...rep.tasks, ...scrub.tasks);
    } else {
        const snap = generateSnapshotConfigs(opts.storagePool);
        const scrub = generateScrubConfigs(opts.storagePool);
        allTasks.push(...snap.tasks, ...scrub.tasks);
    }

    return { tasks: allTasks };
}
