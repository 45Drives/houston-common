import { legacy, File, server, unwrap } from '@/index';
import { SchedulerType, TaskInstanceType } from './types';
import { TaskInstance, TaskTemplate, TaskSchedule, ZFSReplicationTaskTemplate, AutomatedSnapshotTaskTemplate, TaskScheduleInterval, RsyncTaskTemplate, ScrubTaskTemplate, SmartTestTemplate, CloudSyncTaskTemplate, CustomTaskTemplate } from './Tasks';
import { ParameterNode, StringParameter, SelectionParameter, IntParameter, BoolParameter } from './Parameters';
import { createStandaloneTask, createTaskFiles, createScheduleForTask, removeTask, runTask, stopTask } from './utils/helpers';
import { TaskExecutionLog } from './TaskLog';
// @ts-ignore
import get_tasks_script from '@/scripts/get-task-instances.py?raw';

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
            exitStatus: e?.exitStatus ?? 1,
        };
    }
}

export class Scheduler implements SchedulerType {
    taskTemplates: TaskTemplate[];
    taskInstances: TaskInstance[];

    constructor(taskTemplates: TaskTemplate[], taskInstances: TaskInstance[]) {
        this.taskTemplates = taskTemplates;
        this.taskInstances = taskInstances;
    }

    private normalizeTemplateKey(x: any): string {
        const s = String(x ?? '').trim();
        if (!s) return s;
        const known = new Set([
            'ZfsReplicationTask',
            'AutomatedSnapshotTask',
            'RsyncTask',
            'ScrubTask',
            'SmartTest',
            'CloudSyncTask',
            'CustomTask',
        ]);
        if (known.has(s)) return s;

        const key = s.replace(/[\s_-]+/g, '').toLowerCase();
        const map: Record<string, string> = {
            zfsreplicationtask: 'ZfsReplicationTask',
            automatedsnapshottask: 'AutomatedSnapshotTask',
            rsynctask: 'RsyncTask',
            scrubtask: 'ScrubTask',
            smarttest: 'SmartTest',
            cloudsynctask: 'CloudSyncTask',
            customtask: 'CustomTask',
        };
        return map[key] ?? s;
    }

    private resolveTemplate(templateName: string) {
        switch (templateName) {
            case 'ZfsReplicationTask': return new ZFSReplicationTaskTemplate();
            case 'AutomatedSnapshotTask': return new AutomatedSnapshotTaskTemplate();
            case 'RsyncTask': return new RsyncTaskTemplate();
            case 'ScrubTask': return new ScrubTaskTemplate();
            case 'SmartTest': return new SmartTestTemplate();
            case 'CloudSyncTask': return new CloudSyncTaskTemplate();
            case 'CustomTask': return new CustomTaskTemplate();
            default: throw new Error(`Unknown template: ${templateName}`);
        }
    }

    private toPlain<T>(x: T): T {
        return JSON.parse(JSON.stringify(x));
    }

    private templateKey(ti: TaskInstanceType, hint?: string): string {
        return (ti as any)._templateKey
            || (hint ? this.normalizeTemplateKey(hint) : '')
            || this.normalizeTemplateKey(ti.template.name);
    }

    private async unitNameFor(ti: TaskInstanceType): Promise<string> {
        const key = this.templateKey(ti);
        return `houston_scheduler_${key}_${ti.name}`;
    }

    private usToMs(us: number): number | 0 {
        return us && Number.isFinite(us) ? Math.floor(us / 1000) : 0;
    }

    private safeBuildParamNode(schema: ParameterNode, params: Record<string, any>): ParameterNode {
        try {
            return this.createParameterNodeFromSchema(schema, params);
        } catch (e) {
            console.warn('Parameter schema hydration failed, falling back to loose node:', e);
            return this.createLooseNodeFromFlatParams(params);
        }
    }

    private createLooseNodeFromFlatParams(params: Record<string, any>): ParameterNode {
        const root = new ParameterNode('Parameters', 'root');
        const boolRe = /^(true|false)$/i;
        for (const [k, v] of Object.entries(params)) {
            const s = String(v ?? '');
            if (boolRe.test(s)) {
                const p = new BoolParameter(k, k);
                p.value = /^true$/i.test(s);
                root.addChild(p);
            } else if (/^-?\d+$/.test(s)) {
                const p = new IntParameter(k, k);
                p.value = parseInt(s, 10);
                root.addChild(p);
            } else {
                const p = new StringParameter(k, k);
                p.value = s;
                root.addChild(p);
            }
        }
        return root;
    }

    async ensureDir(path: string) {
        await runCommand(['mkdir', '-p', path], { superuser: 'try' });
    }

    /*
     * Unified, view-friendly status + timestamps
     */
    async getDisplayMeta(ti: TaskInstanceType): Promise<{
        unit: string;
        statusText: string;
        lastRunMs: number;
        nextRunMs?: number;
    }> {
        const log = new TaskExecutionLog([]);
        const unit = await this.unitNameFor(ti);

        const readPersistedLastRunMs = async (): Promise<number> => {
            try {
                const lastrunPath = `/etc/systemd/system/${unit}.lastrun`;
                const { stdout, exitStatus } = await runCommand(["cat", lastrunPath], { superuser: "try" });
                if (exitStatus !== 0) return 0;
                const epoch = parseInt(stdout.trim(), 10);
                return Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : 0;
            } catch {
                return 0;
            }
        };

        let timerOut = '', serviceOut = '';
        const preferTimer = !!ti?.schedule?.enabled;

        const pickStatusSource = (_t: ReturnType<Scheduler['parseShow']>, s: ReturnType<Scheduler['parseShow']>) => {
            if (s.active === 'active' && s.sub === 'running') return serviceOut;
            if (s.active === 'failed' || s.sub === 'failed') return serviceOut;
            return preferTimer ? timerOut : serviceOut;
        };

        try {
            try {
                const { stdout, stderr, exitStatus } = await runCommand(
                    [
                        'systemctl', 'show', `${unit}.timer`, '--no-pager',
                        '--property', 'LoadState,ActiveState,SubState,Result,LastTriggerUSec,NextElapseUSecRealtime,MergedUnit',
                    ],
                    { superuser: 'try' }
                );

                if (exitStatus === 0) {
                    timerOut = stdout;
                } else if (!/not found/i.test(stdout) && !/not found/i.test(stderr)) {
                    console.warn(`getDisplayMeta(timer ${unit}):`, stderr || stdout);
                }
            } catch (e) {
                console.warn(`getDisplayMeta(timer ${unit}) error:`, errorString(e));
            }

            const { stdout, stderr, exitStatus } = await runCommand(
                [
                    'systemctl', 'show', `${unit}.service`, '--no-pager',
                    '--property', 'LoadState,ActiveState,SubState,Result,ActiveEnterTimestampUSec,ActiveEnterTimestamp,ExecMainStartTimestampUSec,ExecMainStartTimestamp,ExecMainExitTimestampUSec,ExecMainExitTimestamp,InactiveEnterTimestampUSec,InactiveEnterTimestamp,MergedUnit',
                ],
                { superuser: 'try' }
            );

            if (exitStatus !== 0) {
                throw new Error(stderr || stdout || `systemctl show ${unit}.service failed with ${exitStatus}`);
            }

            serviceOut = stdout;

            const t = this.parseShow(timerOut);
            const s = this.parseShow(serviceOut);

            const source = pickStatusSource(t, s);
            const statusText = await this.parseTaskStatus(source, unit, log, ti);

            const lastRunUs = t.lastTriggerUSec || s.serviceExitUSec || s.serviceStartUSec || 0;
            const nextRunUs = t.nextElapseUSec || 0;
            let lastRunMs = this.usToMs(Number(lastRunUs));

            if (!lastRunMs) {
                lastRunMs = await readPersistedLastRunMs();
            }

            return {
                unit,
                statusText: String(statusText || '—'),
                lastRunMs,
                nextRunMs: this.usToMs(nextRunUs),
            };
        } catch (e) {
            console.warn(`getDisplayMeta(service ${unit}) failed:`, errorString(e));
            const fallbackMs = await readPersistedLastRunMs();
            return { unit, statusText: '—', lastRunMs: fallbackMs };
        }
    }

    formatLocal(ms?: number): string {
        if (!ms) return '—';
        const d = new Date(ms);

        const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);

        const tzShort = (() => {
            const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d);
            let v = parts.find(p => p.type === 'timeZoneName')?.value ?? '';

            if (/^GMT[+-]/i.test(v) || v === '') {
                const m = d.toString().match(/\(([^)]+)\)$/);
                if (m && m[1]) {
                    const abbr = m[1].split(/\s+/).map(w => w[0]).join('');
                    if (abbr && abbr.length <= 5) v = abbr;
                }
            }
            return v;
        })();

        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');

        return `${weekday} ${y}-${mo}-${da} ${hh}:${mm}:${ss}${tzShort ? ' ' + tzShort : ''}`;
    }

    async loadTaskInstances() {
        this.taskInstances.splice(0, this.taskInstances.length);

        const coerceTemplateName = (tpl: any): string => {
            if (typeof tpl === 'string') return tpl;
            if (tpl && typeof tpl === 'object') return String(tpl.name || tpl.type || '');
            return String(tpl ?? '');
        };

        const safeParseItems = (raw: any): any[] => {
            if (Array.isArray(raw)) return raw;
            try { return JSON.parse(String(raw || '[]')); } catch { return []; }
        };

        try {
            const { stdout } = await runCommand(
                ['/usr/bin/env', 'python3', '-c', get_tasks_script],
                { superuser: 'try' }
            );
            const systemTasksData = safeParseItems(stdout);

            for (const task of systemTasksData) {
                try {
                    if (!task?.name || !task?.template) continue;

                    const templateKey = this.normalizeTemplateKey(coerceTemplateName(task.template));
                    const tpl = this.resolveTemplate(templateKey);

                    const paramNode = this.createParameterNodeFromSchema(tpl.parameterSchema, task.parameters || {});
                    const intervals = (task.schedule?.intervals || []).map((i: any) => new TaskScheduleInterval(i));
                    const schedule = new TaskSchedule(!!task.schedule?.enabled, intervals, !!task.schedule?.runOnBoot);

                    let needsResave = false;
                    if (templateKey === 'ZfsReplicationTask' || templateKey === 'AutomatedSnapshotTask') {
                        needsResave = this.migrateEnvRetentionToIntervals(templateKey, task.parameters || {}, schedule);
                    }

                    const inst = new TaskInstance(task.name, tpl, paramNode, schedule, task.notes || '');
                    (inst as any)._templateKey = templateKey;
                    this.taskInstances.push(inst);

                    if (needsResave) {
                        try {
                            console.log(`[migration] Re-saving task "${task.name}" to remove old retention env keys`);
                            await this.updateTaskInstance(inst);
                        } catch (e) {
                            console.warn(`[migration] Failed to re-save task "${task.name}":`, e);
                        }
                    }
                } catch (e) {
                    console.warn('skip bad legacy task record:', e);
                }
            }
        } catch (e) {
            console.error(errorString(e));
        }
    }

    createParameterNodeFromSchema(schema: ParameterNode, parameters: any): ParameterNode {
        function cloneSchema(node: ParameterNode): ParameterNode {
            let newNode: ParameterNode;

            if (node instanceof StringParameter) {
                newNode = new StringParameter(node.label, node.key);
            } else if (node instanceof IntParameter) {
                newNode = new IntParameter(node.label, node.key);
            } else if (node instanceof BoolParameter) {
                newNode = new BoolParameter(node.label, node.key);
            } else if (node instanceof SelectionParameter) {
                newNode = new SelectionParameter(node.label, node.key);
            } else {
                newNode = new ParameterNode(node.label, node.key);
            }

            node.children.forEach(child => {
                newNode.addChild(cloneSchema(child));
            });

            return newNode;
        }

        const parameterRoot = cloneSchema(schema);

        function assignValues(node: ParameterNode, prefix = ''): void {
            const currentPrefix = prefix ? prefix + '_' : '';
            const fullKey = currentPrefix + node.key;
            if (parameters.hasOwnProperty(fullKey)) {
                let value = parameters[fullKey];
                if (node instanceof StringParameter || node instanceof SelectionParameter) {
                    node.value = value;
                } else if (node instanceof IntParameter) {
                    node.value = parseInt(value);
                } else if (node instanceof BoolParameter) {
                    node.value = value === 'true';
                }
            }
            node.children.forEach(child => assignValues(child, fullKey));
        }

        assignValues(parameterRoot);
        return parameterRoot;
    }

    parseEnvKeyValues(envKeyValues: string[], templateName: string) {
        let envObject = envKeyValues.reduce((acc, curr) => {
            const [key, ...rest] = curr.split('=');
            if (key === undefined) return acc;
            const value = rest.join('=');
            acc[key] = value;
            return acc;
        }, {} as Record<string, string|number>);

        function formatEnvOption(envObject: Record<string, string|number>, key: string, emptyValue = '', excludeValues: (string|number)[] = [0, '0', "''"], resetKeys: string[] = []) {
            if (envObject[key] && !excludeValues.includes(envObject[key])) {
                envObject[key] = `${envObject[key]}`;
            } else {
                envObject[key] = emptyValue;
                resetKeys.forEach(resetKey => envObject[resetKey] = emptyValue);
            }
        }

        switch (templateName) {
            case 'ZfsReplicationTask':
                if (envObject['zfsRepConfig_sendOptions_raw_flag'] === 'true') {
                    envObject['zfsRepConfig_sendOptions_compressed_flag'] = '';
                } else if (envObject['zfsRepConfig_sendOptions_compressed_flag'] === 'true') {
                    envObject['zfsRepConfig_sendOptions_raw_flag'] = '';
                }
                delete envObject['zfsRepConfig_snapshotRetention_source_retentionTime'];
                delete envObject['zfsRepConfig_snapshotRetention_source_retentionUnit'];
                delete envObject['zfsRepConfig_snapshotRetention_destination_retentionTime'];
                delete envObject['zfsRepConfig_snapshotRetention_destination_retentionUnit'];
                break;

            case 'AutomatedSnapshotTask':
                delete envObject['autoSnapConfig_snapshotRetention_retentionTime'];
                delete envObject['autoSnapConfig_snapshotRetention_retentionUnit'];
                break;

            case 'RsyncTask':
                if (!envObject['rsyncConfig_target_info_host']) {
                    envObject['rsyncConfig_target_info_host'] = '';
                    envObject['rsyncConfig_target_info_port'] = '';
                    envObject['rsyncConfig_target_info_user'] = '';
                }
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_log_file_path');
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_bandwidth_limit_kbps');
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_include_pattern');
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_exclude_pattern');
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_custom_args');
                break;

            case 'CloudSyncTask':
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_log_file_path');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_bandwidth_limit_kbps');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_include_pattern');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_exclude_pattern');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_custom_args');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_transfers');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_max_transfer_size', '', [0, '0', "''"], ['cloudSyncConfig_rcloneOptions_max_transfer_size_unit']);
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_include_from_path');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_exclude_from_path');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_multithread_chunk_size', '', [0, '0', "''"], ['cloudSyncConfig_rcloneOptions_multithread_chunk_size_unit']);
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_multithread_cutoff', '', [0, '0', "''"], ['cloudSyncConfig_rcloneOptions_multithread_cutoff_unit']);
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_multithread_streams');
                formatEnvOption(envObject, 'cloudSyncConfig_rcloneOptions_multithread_write_buffer_size', '', [0, '0', "''"], ['cloudSyncConfig_rcloneOptions_multithread_write_buffer_size_unit']);
                break;

            default:
                break;
        }
        return envObject;
    }

    getScriptFromTemplateName(templateName: string) {
        switch (templateName) {
            case 'ZfsReplicationTask':
                return 'replication-script';
            case 'AutomatedSnapshotTask':
                return 'autosnap-script';
            case 'RsyncTask':
                return 'rsync-script';
            case 'SmartTest':
                return 'smart-test-script';
            case 'ScrubTask':
                return 'scrub-script';
            case 'CloudSyncTask':
                return 'cloudsync-script';
            default:
                console.error('no script provided');
                return 'undefined';
        }
    }

    /**
     * Export all task configurations as a JSON blob for backup.
     */
    async exportTasks(): Promise<string> {
        const exported: any[] = [];

        for (const ti of this.taskInstances) {
            const templateName = this.normalizeTemplateKey(ti.template.name);
            const envKeyValues = ti.parameters.asEnvKeyValues();
            const envObject = this.parseEnvKeyValues(envKeyValues, templateName);

            let userScriptBody = '';
            if (templateName === 'CustomTask') {
                const filePath = envObject['customTaskConfig_filePath'];
                if (typeof filePath === 'string' && filePath.includes('/user_scripts/')) {
                    try {
                        const { stdout } = await runCommand(['cat', filePath], { superuser: 'try' });
                        userScriptBody = stdout;
                    } catch { /* ignore */ }
                }
            }

            exported.push({
                name: ti.name,
                template: templateName,
                parameters: envObject,
                schedule: this.toPlain(ti.schedule),
                notes: ti.notes || '',
                userScriptBody,
            });
        }

        return JSON.stringify({ version: 1, exportDate: new Date().toISOString(), tasks: exported }, null, 2);
    }

    private importedConfigMatchesExisting(existing: TaskInstance, imported: any): boolean {
        try {
            const existingTemplate = this.normalizeTemplateKey(existing.template.name);
            const importedTemplate = this.normalizeTemplateKey(imported.template);
            if (existingTemplate !== importedTemplate) return false;

            const existingEnv = this.parseEnvKeyValues(existing.parameters.asEnvKeyValues(), existingTemplate);
            const importedParams = imported.parameters || {};

            const allKeys = new Set([...Object.keys(existingEnv), ...Object.keys(importedParams)]);
            allKeys.delete('taskName');
            for (const key of allKeys) {
                if (String(existingEnv[key] ?? '') !== String(importedParams[key] ?? '')) return false;
            }

            return true;
        } catch {
            return false;
        }
    }

    private generateUniqueName(baseName: string, existingNames: Set<string>): string {
        let candidate = `${baseName}_imported`;
        if (!existingNames.has(candidate)) return candidate;
        let counter = 2;
        while (existingNames.has(`${baseName}_imported_${counter}`)) {
            counter++;
        }
        return `${baseName}_imported_${counter}`;
    }

    async importTasks(jsonString: string): Promise<{ imported: string[]; skipped: string[]; renamed: string[]; errors: string[] }> {
        const result = { imported: [] as string[], skipped: [] as string[], renamed: [] as string[], errors: [] as string[] };

        let data: any;
        try {
            data = JSON.parse(jsonString);
        } catch {
            result.errors.push('Invalid JSON file.');
            return result;
        }

        const tasks = data?.tasks;
        if (!Array.isArray(tasks)) {
            result.errors.push('No tasks array found in backup file.');
            return result;
        }

        const existingNames = new Set(this.taskInstances.map(t => t.name));

        for (const t of tasks) {
            try {
                if (!t?.name || !t?.template) {
                    result.errors.push(`Skipped invalid entry (missing name or template).`);
                    continue;
                }

                let finalName = t.name;

                if (existingNames.has(t.name)) {
                    const existingTask = this.taskInstances.find(ti => ti.name === t.name);
                    if (existingTask && this.importedConfigMatchesExisting(existingTask, t)) {
                        result.skipped.push(t.name);
                        continue;
                    }
                    finalName = this.generateUniqueName(t.name, existingNames);
                    result.renamed.push(`${t.name} → ${finalName}`);
                }

                const templateKey = this.normalizeTemplateKey(t.template);
                const tpl = this.resolveTemplate(templateKey);
                const paramNode = this.safeBuildParamNode(tpl.parameterSchema, t.parameters || {});

                const intervals = (t.schedule?.intervals || []).map((i: any) => new TaskScheduleInterval(i));
                const schedule = new TaskSchedule(!!t.schedule?.enabled, intervals, !!t.schedule?.runOnBoot);

                const inst = new TaskInstance(finalName, tpl, paramNode, schedule, t.notes || '');

                if (templateKey === 'CustomTask' && t.userScriptBody) {
                    const scriptDir = '/opt/45drives/houston/scheduler/user_scripts';
                    const scriptFilePath = `${scriptDir}/${finalName}.sh`;
                    await runCommand(['mkdir', '-p', scriptDir], { superuser: 'try' });
                    const scriptFile = new File(server, scriptFilePath);
                    await unwrap(scriptFile.write(t.userScriptBody, { superuser: 'try' }));
                    await runCommand(['chmod', '+x', scriptFilePath], { superuser: 'try' });
                }

                await this.registerTaskInstance(inst);
                result.imported.push(finalName);
                existingNames.add(finalName);
            } catch (e) {
                result.errors.push(`${t.name}: ${errorString(e)}`);
            }
        }

        return result;
    }

    async registerTaskInstance(taskInstance: TaskInstance) {
        const envKeyValues = taskInstance.parameters.asEnvKeyValues();
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);
        let scriptPath = '';
        const envObject = this.parseEnvKeyValues(envKeyValues, templateName);
        envObject['taskName'] = taskInstance.name;

        if (templateName === 'CustomTask') {
            const children = taskInstance.parameters?.children;
            const pathParam = children?.find((child: any) => child.key === 'filePath');
            const commandParam = children?.find((child: any) => child.key === 'command');
            const commandValue = commandParam?.value || '';

            if (commandValue && commandValue.includes('\n')) {
                const scriptDir = '/opt/45drives/houston/scheduler/user_scripts';
                const scriptFilePath = `${scriptDir}/${taskInstance.name}.sh`;

                await runCommand(['mkdir', '-p', scriptDir], { superuser: 'try' });

                let scriptContent = commandValue;
                if (!scriptContent.startsWith('#!')) {
                    scriptContent = '#!/bin/bash\n' + scriptContent;
                }

                const scriptFile = new File(server, scriptFilePath);
                await unwrap(scriptFile.write(scriptContent, { superuser: 'try' }));
                await runCommand(['chmod', '+x', scriptFilePath], { superuser: 'try' });

                envObject['customTaskConfig_filePath'] = scriptFilePath;
                envObject['customTaskConfig_filePath_flag'] = 'true';
                envObject['customTaskConfig_command_flag'] = 'false';
                scriptPath = scriptFilePath;
            } else {
                scriptPath = pathParam?.value || '/opt/45drives/houston/scheduler/scripts/undefined.py';
            }
        } else {
            const scriptFileName = this.getScriptFromTemplateName(templateName);
            scriptPath = `/opt/45drives/houston/scheduler/scripts/${scriptFileName}.py`;
        }

        if (templateName === 'CloudSyncTask') {
            envObject['RCLONE_CONFIG'] = '/root/.config/rclone/rclone.conf';
            envObject['cloudSyncConfig_rclone_config_path'] = '/root/.config/rclone/rclone.conf';
        }

        const filteredEnvObject = Object.fromEntries(
            Object.entries(envObject).filter(([_, value]) => value !== '' && value !== 0)
        );

        const envKeyValuesString = Object.entries(filteredEnvObject)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const templateTimerPath = `/opt/45drives/houston/scheduler/templates/Schedule.timer`;
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const baseName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;
        const envFilePath = `/etc/systemd/system/${baseName}.env`;
        const jsonFilePath = `/etc/systemd/system/${baseName}.json`;
        const notesFilePath = `/etc/systemd/system/${baseName}.txt`;

        const envFile = new File(server, envFilePath);
        await unwrap(envFile.write(envKeyValuesString, { superuser: 'try' }));
        console.log('env file created and content written successfully');

        if (taskInstance.notes !== '') {
            const notesFile = new File(server, notesFilePath);
            await unwrap(notesFile.write(taskInstance.notes ?? '', { superuser: 'try' }));
            console.log('notes file created and content written successfully');
        }

        if (taskInstance.schedule.intervals.length < 1) {
            console.log('No schedules found, parameter file generated.');
            await createStandaloneTask(templateName, scriptPath, envFilePath);
        } else {
            const jsonFile = new File(server, jsonFilePath);
            const jsonString = JSON.stringify(taskInstance.schedule, null, 2);
            await unwrap(jsonFile.write(jsonString, { superuser: 'try' }));
            console.log('json file created and content written successfully');

            const envFileForUpdate = new File(server, envFilePath);
            const envWithSchedulePath = envKeyValuesString + `\nscheduleJsonPath=${jsonFilePath}`;
            await unwrap(envFileForUpdate.replace(envWithSchedulePath, { superuser: 'try' }));

            await createTaskFiles(templateName, scriptPath, envFilePath, templateTimerPath, jsonFilePath);

            if (taskInstance.schedule.enabled) {
                await runCommand(['systemctl', 'enable', `${baseName}.timer`], { superuser: 'try' });
                await runCommand(['systemctl', 'start', `${baseName}.timer`], { superuser: 'try' });

                if (taskInstance.schedule.runOnBoot) {
                    const timerPath = `/etc/systemd/system/${baseName}.timer`;
                    const timerFile = new File(server, timerPath);
                    const currentContent = await unwrap(timerFile.read());
                    const updatedContent = String(currentContent).replace('Persistent=false', 'Persistent=true');
                    await unwrap(timerFile.replace(updatedContent, { superuser: 'try' }));
                    await runCommand(['systemctl', 'daemon-reload'], { superuser: 'try' });
                }
            }
        }
    }

    async updateTaskInstance(taskInstance: TaskInstance, _opts?:{oldName?: string}) {
        const envKeyValues = taskInstance.parameters.asEnvKeyValues();
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);

        const envObject = this.parseEnvKeyValues(envKeyValues, templateName);
        envObject['taskName'] = taskInstance.name;

        let scriptPath: string;
        if (templateName === 'CustomTask') {
            const pathParam = taskInstance.parameters?.children?.find((c: any) => c.key === 'path');
            scriptPath = pathParam?.value || '/opt/45drives/houston/scheduler/scripts/undefined.py';
        } else {
            const scriptFileName = this.getScriptFromTemplateName(templateName);
            scriptPath = `/opt/45drives/houston/scheduler/scripts/${scriptFileName}.py`;
        }

        if (templateName === 'CloudSyncTask') {
            envObject['RCLONE_CONFIG'] = '/root/.config/rclone/rclone.conf';
            envObject['cloudSyncConfig_rclone_config_path'] = '/root/.config/rclone/rclone.conf';
        }

        const filteredEnvObject = Object.fromEntries(
            Object.entries(envObject).filter(([_, value]) => value !== '' && value !== 0)
        );

        const envKeyValuesString = Object.entries(filteredEnvObject)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const houstonSchedulerPrefix = 'houston_scheduler_';
        const baseName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;
        const envFilePath = `/etc/systemd/system/${baseName}.env`;

        const envFile = new File(server, envFilePath);
        await unwrap(envFile.replace(envKeyValuesString, { superuser: 'try' }));
        console.log('env file updated successfully');

        await createStandaloneTask(templateName, scriptPath, envFilePath);

        await runCommand(['systemctl', 'daemon-reload'], { superuser: 'try' });
    }

    async updateTaskNotes(taskInstance: TaskInstance) {
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);

        const houstonSchedulerPrefix = 'houston_scheduler_';
        const notesFilePath = `/etc/systemd/system/${houstonSchedulerPrefix}${templateName}_${taskInstance.name}.txt`;

        console.log('notesFilePath:', notesFilePath);

        const notesFile = new File(server, notesFilePath);
        await unwrap(notesFile.replace(taskInstance.notes ?? '', { superuser: 'try' }));
        console.log('notes file updated successfully');
    }

    async unregisterTaskInstance(taskInstance: TaskInstanceType) {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);

        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;
        if (taskInstance.schedule.enabled) {
            await this.disableSchedule(taskInstance);
        }
        await removeTask(fullTaskName);

        if (templateName === 'CustomTask') {
            const userScriptPath = `/opt/45drives/houston/scheduler/user_scripts/${taskInstance.name}.sh`;
            await runCommand(['rm', '-f', userScriptPath], { superuser: 'try' }).catch(() => {});
        }

        console.log(`${fullTaskName} removed`);
    }

    async runTaskNow(taskInstance: TaskInstanceType): Promise<void> {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);

        const waitForFinalStatus = async (): Promise<string> => {
            let finalStatus = 'Unknown';

            while (true) {
                const status = await this.getServiceStatus(taskInstance);
                if (status) {
                    finalStatus = status;
                }

                if (
                    status === 'Completed' ||
                    status === 'Inactive (Disabled)' ||
                    status === 'Failed'
                ) {
                    break;
                }

                await new Promise(r => setTimeout(r, 1000));
            }

            return finalStatus;
        };

        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        console.log(`Running ${fullTaskName}...`);
        try {
            await runCommand(['systemctl', 'reset-failed', `${fullTaskName}.service`], { superuser: 'try' });
        } catch {
            // best-effort
        }
        await runTask(fullTaskName);

        const finalStatus = await waitForFinalStatus();
        console.log(`Task ${fullTaskName} completed with status: ${finalStatus}`);
    }

    async stopTaskNow(taskInstance: TaskInstanceType) {
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        console.log(`Stopping ${fullTaskName}...`);
        await stopTask(fullTaskName);
        console.log(`Task ${fullTaskName} stopped.`);
    }

    async getTimerStatus(ti: TaskInstanceType): Promise<string | false> {
        const log = new TaskExecutionLog([]);
        const unit = await this.unitNameFor(ti);
        try {
            const { stdout, stderr, exitStatus } = await runCommand(
                [
                    'systemctl', 'show', `${unit}.timer`, '--no-pager',
                    '--property',
                    'LoadState,ActiveState,SubState,Result,LastTriggerUSec,LastTrigger,NextElapseUSecRealtime,MergedUnit',
                ],
                { superuser: 'try' }
            );

            if (exitStatus !== 0) {
                if (/not found/i.test(stdout) || /not found/i.test(stderr)) {
                    return this.parseTaskStatus('', unit, log, ti);
                }
                console.warn(`getTimerStatus(${unit}):`, stderr || stdout);
                return false;
            }

            return this.parseTaskStatus(stdout || '', unit, log, ti);
        } catch (e: any) {
            console.warn(`getTimerStatus(${unit}) error:`, errorString(e));
            return false;
        }
    }

    async getServiceStatus(ti: TaskInstanceType): Promise<string | false> {
        const log = new TaskExecutionLog([]);
        const unit = await this.unitNameFor(ti);
        try {
            const { stdout, stderr, exitStatus } = await runCommand(
                [
                    'systemctl', 'show', `${unit}.service`, '--no-pager',
                    '--property',
                    'LoadState,ActiveState,SubState,Result,ActiveEnterTimestampUSec,ActiveEnterTimestamp,ExecMainStartTimestampUSec,ExecMainStartTimestamp,MergedUnit',
                ],
                { superuser: 'try' }
            );

            if (exitStatus !== 0) {
                if (/not found/i.test(stdout) || /LoadState=not-found/.test(stdout)) {
                    return this.parseTaskStatus('', unit, log, ti);
                }
                console.warn(`getServiceStatus(${unit}):`, stderr || stdout);
                return false;
            }

            return this.parseTaskStatus(stdout || '', unit, log, ti);
        } catch (e: any) {
            console.warn(`getServiceStatus(${unit}) error:`, errorString(e));
            return false;
        }
    }

    private parseShow(output: string) {
        const m = new Map<string, string>();
        for (const line of (output || '').split(/\r?\n/)) {
            const i = line.indexOf('=');
            if (i > 0) m.set(line.slice(0, i), line.slice(i + 1));
        }

        const num = (k: string) => {
            const v = m.get(k);
            const n = v ? Number(v) : NaN;
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const ts = (numKey: string, strKey: string) => {
            const u = num(numKey);
            if (u) return u;
            const s = m.get(strKey);
            if (s) {
                const ms = Date.parse(s);
                if (Number.isFinite(ms)) return ms * 1000;
            }
            return 0;
        };

        return {
            load: m.get('LoadState') || '',
            active: m.get('ActiveState') || '',
            sub: m.get('SubState') || '',
            result: m.get('Result') || '',
            lastTriggerUSec: ts('LastTriggerUSec', 'LastTrigger'),
            nextElapseUSec: num('NextElapseUSecRealtime'),
            serviceStartUSec:
                ts('ExecMainStartTimestampUSec', 'ExecMainStartTimestamp') ||
                ts('ActiveEnterTimestampUSec', 'ActiveEnterTimestamp'),
            serviceExitUSec:
                ts('ExecMainExitTimestampUSec', 'ExecMainExitTimestamp') ||
                ts('InactiveEnterTimestampUSec', 'InactiveEnterTimestamp'),
        };
    }

    private async parseTaskStatus(
        output: string,
        unit: string,
        log: TaskExecutionLog,
        ti: TaskInstanceType
    ): Promise<string | false> {
        try {
            if (output.includes('ActiveState=')) {
                const s = this.parseShow(output);

                if (s.active === 'active' && s.sub === 'waiting') return 'Active (Pending)';
                if (s.active === 'active' && s.sub === 'running') return 'Active (Running)';

                if (s.active === 'inactive' && s.sub === 'dead') {
                    const hasRun = !!s.serviceStartUSec;

                    if (!hasRun) {
                        return 'Inactive (Disabled)';
                    }

                    if (s.result === 'success') {
                        return 'Completed';
                    }

                    let recentlyCompleted = false;
                    try {
                        recentlyCompleted = await log.wasTaskRecentlyCompleted(ti);
                    } catch (_) {
                        // swallow
                    }
                    return recentlyCompleted ? 'Completed' : 'Inactive (Disabled)';
                }

                if (s.active === 'failed' || s.sub === 'failed') return 'Failed';
                const base = s.active || 'unknown';
                return s.sub ? `${base} (${s.sub})` : base;
            }

            const m = output.match(/^\s*Active:\s*([a-z]+)\s*\(([^)]*)\)/im);
            if (!m) return 'Unit inactive or not found.';

            const stateText = `${m[1]} (${m[2]})`;
            switch (stateText) {
                case 'activating (start)': return 'Starting...';
                case 'active (waiting)': return 'Active (Pending)';
                case 'active (running)': return 'Active (Running)';
                case 'inactive (dead)': {
                    const unitEsc = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const succeededRegex = new RegExp(`${unitEsc}\\.service: Succeeded`, 'm');
                    const noJournal = /No journal files were opened|You are currently not seeing messages/.test(output);
                    if (succeededRegex.test(output)) return 'Completed';

                    let recentlyCompleted = false;
                    try {
                        if (!noJournal) {
                            recentlyCompleted = await log.wasTaskRecentlyCompleted(ti);
                        }
                    } catch (_) {
                        /* swallow */
                    }
                    return recentlyCompleted ? 'Completed' : 'Inactive (Disabled)';
                }
                default:
                    return stateText;
            }
        } catch (e) {
            console.error(`Error parsing status for ${unit}:`, e);
            return false;
        }
    }

    async getTaskProgress(taskInstance: TaskInstanceType): Promise<number | null> {
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        try {
            const { stdout } = await runCommand(
                ['systemctl', 'show', `${fullTaskName}.service`, '--property=StatusText', '--value'],
                { superuser: 'try' }
            );
            const txt = (stdout || '').trim();
            const match = txt.match(/(\d+)%/);
            return match && match[1] ? parseInt(match[1], 10) : null;
        } catch {
            return null;
        }
    }

    async enableSchedule(taskInstance: TaskInstanceType): Promise<void> {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        try {
            const timerName = `${fullTaskName}.timer`;

            await runCommand(['systemctl', 'enable', timerName], { superuser: 'try' });

            console.log(`${timerName} has been enabled and started`);
            taskInstance.schedule.enabled = true;

            await this.updateSchedule(taskInstance);
        } catch (error) {
            console.error(errorString(error));
        }
    }

    async disableSchedule(taskInstance: TaskInstanceType): Promise<void> {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        try {
            const timerName = `${fullTaskName}.timer`;

            await runCommand(['systemctl', 'stop', timerName], { superuser: 'try' });
            await runCommand(['systemctl', 'disable', timerName], { superuser: 'try' });

            console.log(`${timerName} has been stopped and disabled`);
            taskInstance.schedule.enabled = false;

            await this.updateSchedule(taskInstance);
        } catch (error) {
            console.error(errorString(error));
        }
    }

    async updateSchedule(taskInstance: TaskInstanceType) {
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);

        const templateTimerPath = `/opt/45drives/houston/scheduler/templates/Schedule.timer`;

        const houstonSchedulerPrefix = 'houston_scheduler_';
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;
        const jsonFilePath = `/etc/systemd/system/${fullTaskName}.json`;

        const jsonFile = new File(server, jsonFilePath);
        const jsonString = JSON.stringify(taskInstance.schedule, null, 2);
        await unwrap(jsonFile.replace(jsonString, { superuser: 'try' }));
        console.log('json file created and content written successfully');

        if (taskInstance.schedule.enabled) {
            await createScheduleForTask(fullTaskName, templateTimerPath, jsonFilePath);

            await runCommand(['systemctl', 'daemon-reload'], { superuser: 'try' });
            await runCommand(['systemctl', 'restart', `${fullTaskName}.timer`], { superuser: 'try' });

            if (taskInstance.schedule.runOnBoot) {
                const timerPath = `/etc/systemd/system/${fullTaskName}.timer`;
                const timerFile = new File(server, timerPath);
                const currentContent = await unwrap(timerFile.read());
                const updatedContent = String(currentContent).replace('Persistent=false', 'Persistent=true');
                await unwrap(timerFile.replace(updatedContent, { superuser: 'try' }));
                await runCommand(['systemctl', 'daemon-reload'], { superuser: 'try' });
            }
        }
    }

    async deleteSchedule(taskInstance: TaskInstanceType) {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = this.normalizeTemplateKey(taskInstance.template.name);
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        const timerUnit = `${fullTaskName}.timer`;
        const jsonPath = `/etc/systemd/system/${fullTaskName}.json`;
        const timerPath = `/etc/systemd/system/${timerUnit}`;

        try {
            await runCommand(['systemctl', 'stop', timerUnit], { superuser: 'try' }).catch(() => { });
            await runCommand(['systemctl', 'disable', timerUnit], { superuser: 'try' }).catch(() => { });

            await runCommand(['rm', '-f', timerPath], { superuser: 'try' });
            await runCommand(['rm', '-f', jsonPath], { superuser: 'try' });

            await runCommand(['systemctl', 'reset-failed'], { superuser: 'try' }).catch(() => { });
            await runCommand(['systemctl', 'daemon-reload'], { superuser: 'try' });

            taskInstance.schedule.enabled = false;
            taskInstance.schedule.intervals = [];

            console.log(`Schedule removed for ${fullTaskName}`);
            return true;
        } catch (e) {
            console.error(errorString(e));
            return false;
        }
    }

    private migrateEnvRetentionToIntervals(
        templateKey: string,
        params: Record<string, any>,
        schedule: TaskSchedule
    ): boolean {
        if (!schedule.intervals.length) return false;

        const anyHasRetention = schedule.intervals.some((iv: any) => iv.retention);

        let hasOldKeys = false;
        if (templateKey === 'ZfsReplicationTask') {
            hasOldKeys = (
                'zfsRepConfig_snapshotRetention_source_retentionTime' in params ||
                'zfsRepConfig_snapshotRetention_source_retentionUnit' in params ||
                'zfsRepConfig_snapshotRetention_destination_retentionTime' in params ||
                'zfsRepConfig_snapshotRetention_destination_retentionUnit' in params
            );
        } else if (templateKey === 'AutomatedSnapshotTask') {
            hasOldKeys = (
                'autoSnapConfig_snapshotRetention_retentionTime' in params ||
                'autoSnapConfig_snapshotRetention_retentionUnit' in params
            );
        }

        if (!hasOldKeys) return false;

        let srcTime = 0, srcUnit = '', dstTime = 0, dstUnit = '';

        if (templateKey === 'ZfsReplicationTask') {
            srcTime = parseInt(params['zfsRepConfig_snapshotRetention_source_retentionTime'] || '0', 10);
            srcUnit = params['zfsRepConfig_snapshotRetention_source_retentionUnit'] || '';
            dstTime = parseInt(params['zfsRepConfig_snapshotRetention_destination_retentionTime'] || '0', 10);
            dstUnit = params['zfsRepConfig_snapshotRetention_destination_retentionUnit'] || '';
        } else if (templateKey === 'AutomatedSnapshotTask') {
            srcTime = parseInt(params['autoSnapConfig_snapshotRetention_retentionTime'] || '0', 10);
            srcUnit = params['autoSnapConfig_snapshotRetention_retentionUnit'] || '';
        }

        if (!anyHasRetention && (srcTime > 0 || dstTime > 0)) {
            console.log(`[migration] Migrating env retention to per-interval for ${templateKey}`);

            for (const interval of schedule.intervals) {
                const retention: any = {};
                if (srcTime > 0) {
                    retention.source = { retentionTime: srcTime, retentionUnit: srcUnit };
                }
                if (dstTime > 0) {
                    retention.destination = { retentionTime: dstTime, retentionUnit: dstUnit };
                }
                (interval as any).retention = retention;
            }
        }

        console.log(`[migration] Old retention env keys detected for ${templateKey} — will re-save to remove them`);
        return true;
    }

    parseIntervalIntoString(interval: any) {
        const elements: string[] = [];

        function getMonthName(number: number) {
            const months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return months[number - 1] || 'undefined';
        }

        function getDaySuffix(day: number) {
            if (day > 3 && day < 21) return 'th';
            switch (day % 10) {
                case 1: return 'st';
                case 2: return 'nd';
                case 3: return 'rd';
                default: return 'th';
            }
        }

        function formatUnit(value: string, type: string) {
            if (value === '*') {
                return type === 'minute' ? 'every minute' :
                    type === 'hour' ? 'every hour' : `every ${type}`;
            } else if (value.startsWith('*/')) {
                const interval = value.slice(2);
                return `every ${interval} ${type}${interval > 1 ? 's' : ''}`;
            } else if (value.includes('/')) {
                const [base, step] = value.split('/');
                if (type === 'day') {
                    return `every ${step} days starting on the ${base}${getDaySuffix(parseInt(base))}`;
                }
                return `every ${step} ${type}${step > 1 ? 's' : ''} starting from ${base}`;
            } else if (value === '0' && type === 'minute') {
                return 'at the start of the hour';
            } else if (value === '0' && type === 'hour') {
                return 'at midnight';
            } else if (type === 'day') {
                return `on the ${value}${getDaySuffix(parseInt(value))} of the month`;
            } else if (type === 'month') {
                return `in ${getMonthName(parseInt(value))}`;
            }
            return `at ${value} ${type}`;
        }

        const formattedMinute = interval.minute ? formatUnit(interval.minute.value.toString(), 'minute') : null;
        const formattedHour = interval.hour ? formatUnit(interval.hour.value.toString(), 'hour') : null;

        if (formattedMinute === null && formattedHour === 'at midnight') {
            elements.push('at midnight');
        } else {
            if (formattedMinute) elements.push(formattedMinute);
            if (formattedHour) elements.push(formattedHour);
        }

        const day = interval.day ? formatUnit(interval.day.value.toString(), 'day') : "every day";
        const month = interval.month ? formatUnit(interval.month.value.toString(), 'month') : "every month";
        const year = interval.year ? formatUnit(interval.year.value.toString(), 'year') : "every year";

        if (day) elements.push(day);
        if (month) elements.push(month);
        if (year) elements.push(year)

        if (interval.dayOfWeek && interval.dayOfWeek.length > 0) {
            elements.push(`on ${interval.dayOfWeek.join(', ')}`);
        }

        return elements.filter(e => e).join(', ');
    }

    describeInterval(interval: any): string {
        const v = (k: 'minute' | 'hour' | 'day' | 'month' | 'year') =>
            interval?.[k]?.value?.toString?.() ?? '*';

        const pad2 = (n: string | number) => String(n).padStart(2, '0');
        const minute = v('minute'), hour = v('hour'), day = v('day'),
            month = v('month'), year = v('year');

        const rawDows: any[] = Array.isArray(interval?.dayOfWeek) ? interval.dayOfWeek : [];
        const toDowIndex = (x: any): number => {
            if (typeof x === 'number') return x;
            const s = String(x).trim();
            if (/^\d+$/.test(s)) { const n = Number(s); return (n >= 0 && n <= 6) ? n : NaN; }
            const short = s.slice(0, 3).toLowerCase();
            const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
            return map[short] ?? NaN;
        };
        const dows: number[] = rawDows.map(toDowIndex).filter((n) => Number.isFinite(n)) as number[];

        const dowName = (n: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n] ?? String(n);
        const monthName = (m: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];

        const isStar = (s: string) => s === '*';
        const isStep = (s: string) => typeof s === 'string' && s.includes('/');
        const stepN = (s: string) => (s.split('/')[1] ?? '').trim();
        const isFixed = (s: string) => !isStar(s) && !isStep(s);

        const hhmm = () =>
            (hour !== '*' && minute !== '*') ? `${pad2(hour)}:${pad2(minute)}`
                : (hour !== '*' && minute === '*') ? `${pad2(hour)}:00`
                    : '';

        if (dows.length) {
            const when = hhmm();
            return `Weekly — ${dows.map((d) => dowName(d)).join(', ')}${when ? ` @ ${when}` : ''}`;
        }

        if (isStar(hour) && /^\*\/\d+$/.test(minute) && isStar(day) && isStar(month)) {
            return `Hourly — every ${minute.slice(2)} min`;
        }
        if (isStep(hour) && isStar(day) && isStar(month)) {
            const n = stepN(hour);
            return `Hourly — every ${n} hours${(minute !== '*' && !isStep(minute)) ? ` @ :${pad2(minute)}` : ''}`;
        }
        if (isStar(hour) && minute !== '*' && !isStep(minute) && isStar(day) && isStar(month)) {
            return `Hourly — at :${pad2(minute)}`;
        }

        if (isFixed(year) && isFixed(month) && isFixed(day)) {
            const when = hhmm();
            const start = `${monthName(Number(month))} ${day}, ${year}`;
            return `Daily — ${when ? `@ ${when} ` : ''}(starts ${start})`;
        }

        if (!isStar(day) && !isStep(day) && isStar(year)) {
            const when = hhmm();
            if (isStep(month)) {
                return `Monthly — on ${day} every ${stepN(month)} months${when ? ` @ ${when}` : ''}`;
            }
            if (!isStar(month)) {
                return `Monthly — on ${day} in ${monthName(Number(month))}${when ? ` @ ${when}` : ''}`;
            }
            return `Monthly — on ${day}${when ? ` @ ${when}` : ''}`;
        }

        const when = hhmm();
        if (isStep(day) && isStar(month)) {
            return `Daily — every ${stepN(day)} days${when ? ` @ ${when}` : ''}`;
        }
        if (isStar(day) && isStar(month)) {
            return `Daily — ${when ? `@ ${when}` : 'any time'}`;
        }

        if (!isStar(month)) {
            if (isStep(month)) return `Monthly — every ${stepN(month)} months${when ? ` @ ${when}` : ''}`;
            return `Monthly — in ${monthName(Number(month))}${when ? ` @ ${when}` : ''}`;
        }

        return `Daily — ${when ? `@ ${when}` : 'any time'}`;
    }
}
