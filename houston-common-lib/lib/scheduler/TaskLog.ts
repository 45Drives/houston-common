import { legacy } from '@/index';
import { formatTemplateName } from './utils/helpers';
import { TaskInstanceType } from './types';

const { useSpawn, errorString } = legacy;

async function runCommand(
    argv: string[],
    opts: { superuser?: 'try' | 'require' } = { superuser: 'try' }
): Promise<{ stdout: string; stderr: string; exitStatus: number }> {
    try {
        const state = useSpawn(argv, opts);
        const result = await state.promise();
        return {
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
            exitStatus: 0,
        };
    } catch (e: any) {
        return {
            stdout: e?.stdout ?? '',
            stderr: e?.stderr ?? errorString(e),
            exitStatus: e?.exit_status ?? 1,
        };
    }
}

/**
 * Maps formatted template names to the debug log file written by each script.
 */
const DEBUG_LOG_MAP: Record<string, string> = {
    ZfsReplicationTask: '/tmp/zfs_rep_debug.log',
    AutomatedSnapshotTask: '/tmp/autosnap_debug.log',
    RsyncTask: '/tmp/rsync_task_debug.log',
    CloudSyncTask: '/tmp/cloudsync_debug.log',
    ScrubTask: '/tmp/scrub_debug.log',
    SmartTest: '/tmp/smart_test_debug.log',
    CustomTask: '/tmp/custom_task_debug.log',
};

export class TaskExecutionLog {
    entries: TaskExecutionResult[];

    constructor(entries: TaskExecutionResult[]) {
        this.entries = entries;
    }

    async fullUnitNameForLogs(ti: TaskInstanceType): Promise<string> {
        const templateName = formatTemplateName(ti.template.name);
        const base = `houston_scheduler_${templateName}_${ti.name}`;
        const scope = (ti as any).scope as ('user' | 'system' | undefined);

        if (scope === 'user') {
            const cockpitUser = await (window as any).cockpit.user();
            const uid: number = cockpitUser?.id;
            return `${base}_u${uid}`;
        }
        return base;
    }

    /**
     * Get logs for a task.
     * - If untilTime is falsy: return ALL logs for this unit.
     * - If untilTime is truthy: return logs up to that time
     */
    async getEntriesFor(taskInstance: TaskInstanceType, untilTime?: string) {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = formatTemplateName(taskInstance.template.name);
        const taskName = taskInstance.name;

        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskName}`;
        const serviceUnit = `${fullTaskName}.service`;

        try {
            if (!untilTime) {
                const logCommand = [
                    'journalctl',
                    '-u', serviceUnit,
                    '--no-pager',
                    '--all'
                ];
                const { stdout } = await runCommand(logCommand, { superuser: 'try' });
                return (stdout || '').trim();
            }

            const command = [
                'journalctl',
                '-u', serviceUnit,
                '--until', untilTime,
                '--no-pager',
                '--all'
            ];
            const { stdout } = await runCommand(command, { superuser: 'try' });
            return (stdout || '').trim();
        } catch (error) {
            console.error(errorString(error));
            return '';
        }
    }

    async getLatestEntryFor(taskInstance: TaskInstanceType) {
        try {
            const unit = await this.fullUnitNameForLogs(taskInstance);

            const showCmd = [
                'systemctl', 'show', `${unit}.service`,
                '-p', 'ExecMainStatus,ExecMainStartTimestamp,ExecMainExitTimestamp,ActiveEnterTimestamp,InactiveEnterTimestamp',
                '--no-pager',
            ];
            const showRes = await runCommand(showCmd, { superuser: 'try' });
            const kv = Object.fromEntries(
                (showRes.stdout || '')
                    .split('\n')
                    .filter((l: string) => l.includes('='))
                    .map((l: string) => l.split('=', 2))
            );

            const rawStatus = kv['ExecMainStatus'];
            const exitCode = Number.isFinite(Number(rawStatus)) ? Number(rawStatus) : 0;

            const startTime =
                kv['ExecMainStartTimestamp'] ||
                kv['ActiveEnterTimestamp'] ||
                '';

            const finishTime =
                kv['ExecMainExitTimestamp'] ||
                kv['InactiveEnterTimestamp'] ||
                '';

            let output = '';
            const baseLogCmd = [
                'journalctl', '-q', '--output=cat',
                '-u', `${unit}.service`,
                '--no-pager', '--all',
            ];

            if (startTime) {
                const logCmd = [...baseLogCmd, '--since', startTime];
                try {
                    const logRes = await runCommand(logCmd, { superuser: 'try' });
                    output = (logRes.stdout || '').replace(/^-- Logs begin at.*\n?/m, '');
                } catch (e) {
                    const msg = errorString(e);
                    if (!/No journal files were opened|not seeing messages/i.test(msg)) {
                        console.warn('journalctl (since) failed:', msg);
                    }
                }
            }

            // Fallback: if we still have nothing, just grab the last 200 lines
            if (!output) {
                try {
                    const fallbackCmd = [...baseLogCmd, '-n', '200'];
                    const logRes = await runCommand(fallbackCmd, { superuser: 'try' });
                    output = (logRes.stdout || '').replace(/^-- Logs begin at.*\n?/m, '');
                } catch (e) {
                    const msg = errorString(e);
                    if (!/No journal files were opened|not seeing messages/i.test(msg)) {
                        console.warn('journalctl (fallback) failed:', msg);
                    }
                }
            }

            return new TaskExecutionResult(exitCode, output, startTime, finishTime);
        } catch (e) {
            console.warn('getLatestEntryFor failed:', errorString(e));
            return false;
        }
    }

    /**
     * Read the /tmp/ debug log for a task's template.
     */
    async getDebugLog(taskInstance: TaskInstanceType, lines = 200): Promise<string> {
        const templateName = formatTemplateName(taskInstance.template.name);
        const logPath = DEBUG_LOG_MAP[templateName];
        if (!logPath) {
            return `No debug log path configured for template "${templateName}".`;
        }
        try {
            const { stdout } = await runCommand(
                ['tail', '-n', String(lines), logPath],
                { superuser: 'try' },
            );
            return (stdout || '').trim() || '(debug log is empty)';
        } catch {
            return `(debug log not found at ${logPath})`;
        }
    }

    async wasTaskRecentlyCompleted(taskInstance: TaskInstanceType): Promise<boolean> {
        const latestEntry = await this.getLatestEntryFor(taskInstance);

        if (!latestEntry) return false;

        if (typeof latestEntry.exitCode === 'number' && latestEntry.exitCode !== 0) {
            return false;
        }

        const tsSource = latestEntry.finishDate || latestEntry.startDate;
        if (!tsSource) {
            return false;
        }

        const finishDate = new Date(tsSource).getTime();
        if (!Number.isFinite(finishDate)) {
            return false;
        }

        const currentTime = Date.now();
        const threshold = 10 * 60 * 1000;

        return (currentTime - finishDate) <= threshold;
    }

    /**
     * Clear debug log for a specific task.
     */
    async clearLogsForTask(taskInstance: TaskInstanceType): Promise<{ success: boolean; message: string }> {
        const templateName = formatTemplateName(taskInstance.template.name);

        try {
            await runCommand(['journalctl', '--rotate'], { superuser: 'try' });

            const debugLogPath = DEBUG_LOG_MAP[templateName];
            if (debugLogPath) {
                await runCommand(['truncate', '-s', '0', debugLogPath], { superuser: 'try' }).catch(() => {});
            }

            return { success: true, message: `Cleared debug log for ${taskInstance.name}. Journal entries remain in system journal.` };
        } catch (e) {
            return { success: false, message: errorString(e) };
        }
    }

    /**
     * Vacuum ALL houston_scheduler journal logs older than the specified number of days.
     */
    async vacuumAllSchedulerLogs(retentionDays: number = 0): Promise<{ success: boolean; message: string }> {
        try {
            await runCommand(['journalctl', '--rotate'], { superuser: 'try' });

            if (retentionDays > 0) {
                await runCommand(
                    ['journalctl', '--vacuum-time', `${retentionDays}d`],
                    { superuser: 'try' }
                );
                return { success: true, message: `Vacuumed system journal entries older than ${retentionDays} day(s).` };
            } else {
                for (const logPath of Object.values(DEBUG_LOG_MAP)) {
                    await runCommand(['truncate', '-s', '0', logPath], { superuser: 'try' }).catch(() => {});
                }
                return { success: true, message: 'Cleared all scheduler debug logs.' };
            }
        } catch (e) {
            return { success: false, message: errorString(e) };
        }
    }
}

export class TaskExecutionResult {
    exitCode: number;
    output: string;
    startDate: string | number;
    finishDate: string | number;

    constructor(exitCode: number, output: string, startDate: string | number, finishDate: string | number) {
        this.exitCode = exitCode;
        this.output = output;
        this.startDate = startDate;
        this.finishDate = finishDate;
    }
}
