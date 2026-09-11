/**
 * Default task configuration generators for Easy Setup.
 * Produces JSON configs compatible with Scheduler.importTasksFromConfig().
 */

export interface PoolDatasetRef {
    poolName: string;
    datasetName: string;
}

export type SnapshotRetentionUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

export interface SnapshotRetention {
    retentionTime: number;
    retentionUnit: SnapshotRetentionUnit;
}

/** How long each snapshot tier is kept. A null tier is not created at all. */
export interface SnapshotPolicy {
    hourly: SnapshotRetention | null;
    daily: SnapshotRetention | null;
    weekly: SnapshotRetention | null;
}

export type SnapshotPolicyName = 'none' | 'minimal' | 'standard' | 'extended' | 'maximum';

export const SNAPSHOT_POLICIES: Record<SnapshotPolicyName, SnapshotPolicy> = {
    none: { hourly: null, daily: null, weekly: null },
    minimal: {
        hourly: null,
        daily: { retentionTime: 1, retentionUnit: 'weeks' },
        weekly: null,
    },
    standard: {
        hourly: { retentionTime: 1, retentionUnit: 'days' },
        daily: { retentionTime: 1, retentionUnit: 'weeks' },
        weekly: { retentionTime: 1, retentionUnit: 'months' },
    },
    extended: {
        hourly: { retentionTime: 2, retentionUnit: 'days' },
        daily: { retentionTime: 2, retentionUnit: 'weeks' },
        weekly: { retentionTime: 3, retentionUnit: 'months' },
    },
    maximum: {
        hourly: { retentionTime: 7, retentionUnit: 'days' },
        daily: { retentionTime: 1, retentionUnit: 'months' },
        weekly: { retentionTime: 1, retentionUnit: 'years' },
    },
};

export const DEFAULT_SNAPSHOT_POLICY: SnapshotPolicyName = 'standard';

export function resolveSnapshotPolicy(policy?: SnapshotPolicyName | SnapshotPolicy): SnapshotPolicy {
    if (!policy) return SNAPSHOT_POLICIES[DEFAULT_SNAPSHOT_POLICY];
    if (typeof policy === 'string') {
        return SNAPSHOT_POLICIES[policy] ?? SNAPSHOT_POLICIES[DEFAULT_SNAPSHOT_POLICY];
    }
    return policy;
}

function humanizeRetention(r: SnapshotRetention): string {
    const unit = r.retentionTime === 1 ? r.retentionUnit.replace(/s$/, '') : r.retentionUnit;
    return `${r.retentionTime} ${unit}`;
}

/**
 * Generate auto-snapshot task configs (Hourly/Daily/Weekly) for single-pool setups.
 */
export function generateSnapshotConfigs(
    pool: PoolDatasetRef,
    policy?: SnapshotPolicyName | SnapshotPolicy
): { tasks: any[] } {
    const filesystem = `${pool.poolName}/${pool.datasetName}`;
    const resolved = resolveSnapshotPolicy(policy);

    const baseParams = (retention: SnapshotRetention) => ({
        autoSnapConfig_filesystem_pool: pool.poolName,
        autoSnapConfig_filesystem_dataset: filesystem,
        autoSnapConfig_recursive_flag: 'false',
        autoSnapConfig_customName_flag: 'false',
        autoSnapConfig_customName: '',
        // Kept for snapshot scripts predating per-interval retention; the scheduler
        // strips these once it migrates the task to the interval-based format.
        autoSnapConfig_snapshotRetention_retentionTime: String(retention.retentionTime),
        autoSnapConfig_snapshotRetention_retentionUnit: retention.retentionUnit,
    });

    const tiers: {
        retention: SnapshotRetention | null;
        name: string;
        cadence: string;
        interval: Record<string, any>;
    }[] = [
            {
                retention: resolved.hourly,
                name: 'AutoSnapshot_Hourly',
                cadence: 'every hour',
                interval: {
                    minute: { value: '0' },
                    hour: { value: '*' },
                    day: { value: '*' },
                    month: { value: '*' },
                    year: { value: '*' },
                },
            },
            {
                retention: resolved.daily,
                name: 'AutoSnapshot_Daily',
                cadence: 'daily',
                interval: {
                    minute: { value: '0' },
                    hour: { value: '0' },
                    day: { value: '*' },
                    month: { value: '*' },
                    year: { value: '*' },
                },
            },
            {
                retention: resolved.weekly,
                name: 'AutoSnapshot_Weekly',
                cadence: 'every Friday',
                interval: {
                    minute: { value: '0' },
                    hour: { value: '0' },
                    day: { value: '*' },
                    month: { value: '*' },
                    year: { value: '*' },
                    dayOfWeek: ['Fri'],
                },
            },
        ];

    return {
        tasks: tiers
            .filter(t => t.retention !== null)
            .map(t => {
                const retention = t.retention!;
                return {
                    name: t.name,
                    template: 'AutomatedSnapshotTask',
                    parameters: baseParams(retention),
                    schedule: {
                        enabled: true,
                        intervals: [{
                            ...t.interval,
                            // Canonical location the scheduler UI and snapshot script read.
                            retention: { destination: { ...retention } },
                        }],
                    },
                    notes: `Take snapshots ${t.cadence} and keep them for ${humanizeRetention(retention)}.`,
                };
            }),
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
    snapshotPolicy?: SnapshotPolicyName | SnapshotPolicy;
}): { tasks: any[] } {
    return {
        tasks: [
            ...generateSnapshotConfigs(opts.storagePool, opts.snapshotPolicy).tasks,
            ...generateScrubConfigs(opts.storagePool).tasks,
        ],
    };
}
