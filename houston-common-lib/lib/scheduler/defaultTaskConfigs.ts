/**
 * Default task configuration generators for Easy Setup.
 * Produces JSON configs compatible with Scheduler.importTasksFromConfig().
 */

export interface PoolDatasetRef {
    poolName: string;
    datasetName: string;
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
 * Generate scrub task configs for the storage pool.
 */
export function generateScrubConfigs(
    storagePool: PoolDatasetRef
): { tasks: any[] } {
    return {
        tasks: [
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
        ],
    };
}

/**
 * Generate all default setup task configs: snapshot + scrub tasks for the storage pool.
 */
export function generateAllDefaultConfigs(opts: {
    storagePool: PoolDatasetRef;
}): { tasks: any[] } {
    return {
        tasks: [
            ...generateSnapshotConfigs(opts.storagePool).tasks,
            ...generateScrubConfigs(opts.storagePool).tasks,
        ],
    };
}
