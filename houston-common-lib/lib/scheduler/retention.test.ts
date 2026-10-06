import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from './Scheduler';
import { generateSnapshotConfigs } from './defaultTaskConfigs';

const runtime = vi.hoisted(() => ({
    writes: [] as { path: string; data: string }[],
    useSpawn: vi.fn(() => ({ promise: async () => ({ stdout: '[]' }) })),
    failJsonWrite: false,
}));

vi.mock('@/index', () => ({
    legacy: { useSpawn: runtime.useSpawn, errorString: String },
    File: vi.fn((_server: unknown, path: string) => ({
        create: async () => undefined,
        write: async (data: string) => {
            if (runtime.failJsonWrite && path.endsWith('.json')) throw new Error('JSON write failed');
            runtime.writes.push({ path, data });
        },
    })),
    server: { execute: vi.fn() },
    Command: vi.fn(),
    unwrap: async (result: unknown) => result,
    ValueError: Error,
}));

describe('interval snapshot retention', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        runtime.writes.length = 0;
        runtime.failJsonWrite = false;
        runtime.useSpawn.mockReset();
        runtime.useSpawn.mockImplementation(() => ({ promise: async () => ({ stdout: '[]' }) }));
    });

    it('preserves setup retention through task import', async () => {
        const scheduler = new Scheduler([], []);
        const register = vi.spyOn(scheduler, 'registerTaskInstance').mockResolvedValue();
        const config = generateSnapshotConfigs({ poolName: 'tank', datasetName: 'share' });

        const result = await scheduler.importTasksFromConfig(JSON.stringify(config));

        expect(result.errors).toEqual([]);
        expect(register.mock.calls.map(([task]) => task.schedule.intervals[0]?.retention)).toEqual([
            { destination: { retentionTime: 1, retentionUnit: 'days' } },
            { destination: { retentionTime: 1, retentionUnit: 'weeks' } },
            { destination: { retentionTime: 1, retentionUnit: 'months' } },
        ]);
    });

    it('migrates legacy snapshot env retention before importing a task', async () => {
        const scheduler = new Scheduler([], []);
        const register = vi.spyOn(scheduler, 'registerTaskInstance').mockResolvedValue();

        const result = await scheduler.importTasksFromConfig(JSON.stringify({ tasks: [{
            name: 'AutoSnapshot_HourlyForADay',
            template: 'AutomatedSnapshotTask',
            parameters: {
                autoSnapConfig_snapshotRetention_retentionTime: '1',
                autoSnapConfig_snapshotRetention_retentionUnit: 'days',
            },
            schedule: { enabled: true, intervals: [{ hour: { value: '*' } }] },
        }] }));

        expect(result.errors).toEqual([]);
        expect(register.mock.calls[0]?.[0].schedule.intervals[0]?.retention).toEqual({
            source: { retentionTime: 1, retentionUnit: 'days' },
        });
    });

    it('migrates replication source and destination retention to every interval', async () => {
        const scheduler = new Scheduler([], []);
        const register = vi.spyOn(scheduler, 'registerTaskInstance').mockResolvedValue();

        const result = await scheduler.importTasksFromConfig(JSON.stringify({ tasks: [{
            name: 'Backup',
            template: 'ZFSReplicationTask',
            parameters: {
                zfsRepConfig_snapshotRetention_source_retentionTime: '1',
                zfsRepConfig_snapshotRetention_source_retentionUnit: 'days',
                zfsRepConfig_snapshotRetention_destination_retentionTime: '1',
                zfsRepConfig_snapshotRetention_destination_retentionUnit: 'months',
            },
            schedule: { enabled: true, intervals: [{ hour: { value: '0' } }, { hour: { value: '12' } }] },
        }] }));

        expect(result.errors).toEqual([]);
        const retention = {
            source: { retentionTime: 1, retentionUnit: 'days' },
            destination: { retentionTime: 1, retentionUnit: 'months' },
        };
        expect(register.mock.calls[0]?.[0].schedule.intervals.map(interval => interval.retention)).toEqual([
            retention, retention,
        ]);
        expect(register.mock.calls[0]?.[0].parameters.asEnvKeyValues().join('\n')).not.toContain('snapshotRetention');
    });

    it('does not overwrite new retention or fill intentionally unlimited intervals', async () => {
        const scheduler = new Scheduler([], []);
        const register = vi.spyOn(scheduler, 'registerTaskInstance').mockResolvedValue();
        const retention = { destination: { retentionTime: 2, retentionUnit: 'weeks' } };

        const result = await scheduler.importTasksFromConfig(JSON.stringify({ tasks: [{
            name: 'Snapshots',
            template: 'AutomatedSnapshotTask',
            parameters: {
                autoSnapConfig_snapshotRetention_retentionTime: '1',
                autoSnapConfig_snapshotRetention_retentionUnit: 'days',
            },
            schedule: { enabled: true, intervals: [{ retention }, {}] },
        }] }));

        expect(result.errors).toEqual([]);
        expect(register.mock.calls[0]?.[0].schedule.intervals.map(interval => interval.retention)).toEqual([
            retention, undefined,
        ]);
    });

    it('writes setup retention into schedule JSON rather than env files', async () => {
        const scheduler = new Scheduler([], []);
        const config = generateSnapshotConfigs({ poolName: 'tank', datasetName: 'share' });

        const result = await scheduler.importTasksFromConfig(JSON.stringify(config));

        expect(result.errors).toEqual([]);
        const schedules = runtime.writes.filter(file => file.path.endsWith('.json'));
        expect(schedules.map(file => JSON.parse(file.data).intervals[0].retention)).toEqual(
            config.tasks.map(task => task.schedule.intervals[0].retention)
        );
        const envFiles = runtime.writes.filter(file => file.path.endsWith('.env'));
        expect(envFiles).toHaveLength(3);
        expect(envFiles.every(file => !file.data.includes('snapshotRetention'))).toBe(true);
        expect(config.tasks.every(task => !Object.keys(task.parameters).some(key => key.includes('snapshotRetention')))).toBe(true);
    });

    it('re-saves legacy retention when loading existing tasks', async () => {
        const scheduler = new Scheduler([], []);
        runtime.useSpawn.mockImplementationOnce(() => ({ promise: async () => ({ stdout: JSON.stringify([{
            name: 'AutoSnapshot_HourlyForADay',
            template: 'AutomatedSnapshotTask',
            parameters: {
                autoSnapConfig_filesystem_dataset: 'tank/share',
                autoSnapConfig_snapshotRetention_retentionTime: '1',
                autoSnapConfig_snapshotRetention_retentionUnit: 'days',
            },
            notes: '',
            schedule: { enabled: true, intervals: [{ hour: { value: '*' } }] },
        }]) }) }));

        await scheduler.loadTaskInstances();

        const scheduleFile = runtime.writes.find(file => file.path.endsWith('.json'));
        expect(JSON.parse(scheduleFile!.data).intervals[0].retention).toEqual({
            source: { retentionTime: 1, retentionUnit: 'days' },
        });
        expect(runtime.writes.find(file => file.path.endsWith('.env'))?.data).not.toContain('snapshotRetention');
    });

    it('does not remove legacy env retention when writing migrated JSON fails', async () => {
        const scheduler = new Scheduler([], []);
        const register = vi.spyOn(scheduler, 'registerTaskInstance').mockResolvedValue();
        await scheduler.importTasksFromConfig(JSON.stringify(generateSnapshotConfigs({ poolName: 'tank', datasetName: 'share' })));
        const task = register.mock.calls[0]![0];
        runtime.failJsonWrite = true;

        await expect(scheduler.updateTaskInstance(task)).rejects.toThrow('JSON write failed');
        expect(runtime.writes.filter(file => file.path.endsWith('.env'))).toEqual([]);
    });

    it('strips legacy retention env keys for both snapshot and replication tasks', () => {
        const scheduler = new Scheduler([], []);
        expect(scheduler.parseEnvKeyValues([
            'taskName=Snapshots',
            'autoSnapConfig_snapshotRetention_retentionTime=1',
            'autoSnapConfig_snapshotRetention_retentionUnit=days',
        ], 'AutomatedSnapshotTask')).toEqual({ taskName: 'Snapshots' });
        expect(scheduler.parseEnvKeyValues([
            'taskName=Backup',
            'zfsRepConfig_snapshotRetention_source_retentionTime=1',
            'zfsRepConfig_snapshotRetention_source_retentionUnit=days',
            'zfsRepConfig_snapshotRetention_destination_retentionTime=1',
            'zfsRepConfig_snapshotRetention_destination_retentionUnit=months',
        ], 'ZfsReplicationTask')).toEqual({ taskName: 'Backup' });
    });
});