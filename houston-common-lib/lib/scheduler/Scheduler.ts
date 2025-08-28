import { ref } from 'vue';
import { legacy, File, server, Command, unwrap } from '@/index';
import {
    SchedulerType,
    TaskInstanceType,
    TaskTemplateType
} from './types';
import {
    TaskInstance,
    TaskSchedule,
    TaskScheduleInterval,
    ZFSReplicationTaskTemplate,
    AutomatedSnapshotTaskTemplate,
    RsyncTaskTemplate,
    ScrubTaskTemplate,
    SmartTestTemplate,
    CloudSyncTaskTemplate,
    CustomTaskTemplate
} from './Tasks';
import {
    ParameterNode,
    StringParameter,
    SelectionParameter,
    IntParameter,
    BoolParameter
} from './Parameters';
import {
    createStandaloneTask,
    createTaskFiles,
    createScheduleForTask,
    removeTask,
    runTask,
    formatTemplateName
} from './utils/helpers';
import { TaskExecutionLog } from './TaskLog';

// @ts-ignore
import get_tasks_script from '@/scripts/get-task-instances.py?raw';

const { errorString, useSpawn } = legacy;

export class Scheduler implements SchedulerType {
    taskTemplates: TaskTemplateType[];
    taskInstances: TaskInstanceType[];

    constructor(
        taskTemplates: TaskTemplateType[],
        taskInstances: TaskInstanceType[]
    ) {
        this.taskTemplates = taskTemplates;
        this.taskInstances = taskInstances;
    }

    /** Ensure a directory exists (idempotent) */
    async ensureDir(path: string) {
        const dir = path.replace(/\/+$/, "");
        try {
            // idempotent: succeeds whether or not the dir already exists
            await unwrap(
                server.execute(
                    new Command(["mkdir", "-p", dir], { superuser: "require" })
                )
            );
            console.log(`✅ ensured dir ${dir}`);
        } catch (err) {
            console.error(`❌ mkdir -p ${dir} failed:`, err);
        }
    }

    async loadTaskInstances(): Promise<void>  {
        this.taskInstances.splice(0, this.taskInstances.length);
        try {
            const state = useSpawn(['/usr/bin/env', 'python3', '-c', get_tasks_script], { superuser: 'try' });
            const tasksOutput = (await state.promise()).stdout!;
            // console.log('Raw tasksOutput:', tasksOutput);
            const tasksData = JSON.parse(tasksOutput) as Array<{
                template: string;
                parameters: any;
                notes: string;
                schedule: { intervals: any[]; enabled: boolean };
                name: string;
            }>;
            tasksData.forEach((task) => {
                const newTaskTemplate = ref();
                if (task.template == 'ZfsReplicationTask') {
                    newTaskTemplate.value = new ZFSReplicationTaskTemplate;
                } else if (task.template == 'AutomatedSnapshotTask') {
                    newTaskTemplate.value = new AutomatedSnapshotTaskTemplate;
                } else if (task.template == 'RsyncTask') {
                    newTaskTemplate.value = new RsyncTaskTemplate;
                } else if (task.template == 'ScrubTask') {
                    newTaskTemplate.value = new ScrubTaskTemplate;
                } else if (task.template == 'SmartTest') {
                    newTaskTemplate.value = new SmartTestTemplate;
                } else if (task.template == 'CloudSyncTask') {
                    newTaskTemplate.value = new CloudSyncTaskTemplate;
                } else if (task.template == 'CustomTask') {
                    newTaskTemplate.value = new CustomTaskTemplate;
                }

                const parameters = task.parameters;
                // console.log("SCHEDULER - Parameters before parsing:", parameters);

                const parameterNodeStructure = this.createParameterNodeFromSchema(newTaskTemplate.value.parameterSchema, parameters);
                const taskIntervals: TaskScheduleInterval[] = [];
                const notes = task.notes;

                task.schedule.intervals.forEach(interval => {
                    const thisInterval = new TaskScheduleInterval(interval);
                    taskIntervals.push(thisInterval);
                });
                const newSchedule = new TaskSchedule(task.schedule.enabled, taskIntervals);
                const newTaskInstance = new TaskInstance(task.name, newTaskTemplate.value, parameterNodeStructure, newSchedule,notes); 
                // console.log("SCHEDULER - TaskInstance:", newTaskInstance);

                this.taskInstances.push(newTaskInstance);
            });

            console.log('this.taskInstances:', this.taskInstances);

        } catch (err: unknown) {
            console.error(errorString(err));
            return;
        }
    }

    // Main function to create a ParameterNode from JSON parameters based on a schema
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
            // console.log(`Assigning value for key: ${fullKey}`);  
            if (parameters.hasOwnProperty(fullKey)) {
                let value = parameters[fullKey];
                // console.log(`Found value: ${value} for key: ${fullKey}`);  // Debug log to confirm values
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

    /**
    * Turn an array of "KEY=VAL" strings into a lookup map
    * and then apply any template-specific tweaks.
    */
    parseEnvKeyValues(
        envKeyValues: string[],
        templateName: string
    ): Record<string, string> {
        // 1) Annotate the accumulator as Record<string,string>
        // 2) Destructure [key, value = ''] so `value` is never undefined
        const envObject = envKeyValues.reduce<Record<string, string>>(
            (acc, curr) => {
                // split into at most two pieces
                const parts = curr.split('=');
                const key = parts[0] || '';           // always a string
                const value = parts[1] ?? '';         // default to empty string

                if (key) {
                    acc[key] = value;
                }
                return acc;
            },
            {}
        );

        // now indexing envObject[...] is always legal
        const formatEnvOption = (
            obj: Record<string, string>,
            key: string,
            emptyValue = '',
            excludeValues: (string | number)[] = [0, '0', "''"],
            resetKeys: string[] = []
        ) => {
            if (obj[key] && !excludeValues.includes(obj[key]!)) {
                /* leave it */
            } else {
                obj[key] = emptyValue;
                resetKeys.forEach(k => (obj[k] = emptyValue));
            }
        };

        switch (templateName) {
            case 'ZfsReplicationTask':
                if (envObject['zfsRepConfig_sendOptions_raw_flag'] === 'true') {
                    envObject['zfsRepConfig_sendOptions_compressed_flag'] = '';
                } else if (
                    envObject['zfsRepConfig_sendOptions_compressed_flag'] === 'true'
                ) {
                    envObject['zfsRepConfig_sendOptions_raw_flag'] = '';
                }
                break;

            case 'RsyncTask':
                if (!envObject['rsyncConfig_target_info_host']) {
                    envObject['rsyncConfig_target_info_host'] = '';
                    envObject['rsyncConfig_target_info_port'] = '';
                    envObject['rsyncConfig_target_info_user'] = '';
                }
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_bandwidth_limit_kbps');
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_include_pattern');
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_exclude_pattern');
                formatEnvOption(envObject, 'rsyncConfig_rsyncOptions_custom_args');
                break;

            case 'CloudSyncTask':
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

        // console.log('envObject After:', envObject);
        return envObject;
    }


    getScriptFromTemplateName(templateName: string): string {
        switch (templateName) {
            case 'ZfsReplicationTask':
                return 'replication-script';
            case 'AutomatedSnapshotTask':
                return 'autosnap-script';
            case 'RsyncTask':
                return 'rsync-script';
            case 'SmartTest':
                return 'smart-test-script';
            case 'CloudSyncTask':
                return 'cloudsync-script';
            default:
                console.log(`${templateName}: no script provided`);
                return '';
        }
    }

    async registerTaskInstance(taskInstance: TaskInstance) {
        // generate env file with key/value pairs (Task Parameters)
        const envKeyValues = taskInstance.parameters.asEnvKeyValues();
        // console.log('envKeyVals Before Parse:', envKeyValues);
        const templateName = formatTemplateName(taskInstance.template.name);
        let scriptPath: string;
        const envObject = this.parseEnvKeyValues(envKeyValues, templateName);
        envObject['taskName'] = taskInstance.name;

        // console.log('registering task data:', taskInstance);
        
        if (templateName === 'CustomTask') {
            const pathParam = taskInstance.parameters.children.find(
                c => c.key === 'path'
            );
            scriptPath =
                (pathParam as any).value ||
                '/opt/45drives/houston/scheduler/scripts/undefined.py';
        } else {
            const scriptFileName = this.getScriptFromTemplateName(templateName);
            scriptPath = `/opt/45drives/houston/scheduler/scripts/${scriptFileName}.py`;
        }

        // Remove empty values from envObject
        const filteredEnvObject: Record<string, string> = Object.fromEntries(
            Object.entries(envObject)
                .filter(([, v]) => v !== '' && v !== '0')
        );
        // console.log('Filtered envObject:', filteredEnvObject);

        // Convert the parsed envObject back to envKeyValuesString
        const envKeyValuesString = Object.entries(filteredEnvObject).map(([key, value]) => `${key}=${value}`).join('\n');
        const templateTimerPath = `/opt/45drives/houston/scheduler/templates/Schedule.timer`;

        const houstonSchedulerPrefix = 'houston_scheduler_';
        const envFilePath = `/etc/systemd/system/${houstonSchedulerPrefix}${templateName}_${taskInstance.name}.env`;

        // console.log('envFilePath:', envFilePath);
        // console.log('envKeyValuesString:', envKeyValuesString);

        await this.ensureDir('/etc/systemd/system');

        const envFile = new File(server, envFilePath);
        await envFile.create(true, { superuser: 'require' })
            .match(
                () => console.log(`✅ created ${envFilePath}`),
                err => console.error(`❌ create file failed:`, err)
            );
        await envFile.write(envKeyValuesString, { superuser: 'require' })
            .match(
                () => console.log(`✅ wrote env for ${templateName}`),
                err => console.error(`❌ write env failed:`, err)
            );

        const jsonFilePath = `/etc/systemd/system/${houstonSchedulerPrefix}${templateName}_${taskInstance.name}.json`;
        // console.log('jsonFilePath:', jsonFilePath);

        //run script to generate notes file
        // console.log("genrating notes file");
        const notesFilePath = `/etc/systemd/system/${houstonSchedulerPrefix}${templateName}_${taskInstance.name}.txt`;
        const notes = taskInstance.notes;

        const notesFile = new File(server, notesFilePath);
        await notesFile.create(true, { superuser: 'require' })
            .match(
                () => console.log(`✅ created ${notesFilePath}`),
                err => console.error(`❌ create notes failed:`, err)
            );
        await notesFile.write(notes, { superuser: 'require' })
            .match(
                () => console.log(`✅ wrote notes for ${templateName}`),
                err => console.error(`❌ write notes failed:`, err)
            );

        //run script to generate service + timer via template, param env and schedule json
        if (taskInstance.schedule.intervals.length < 1) {
            //ignore schedule for now
            console.log('No schedules found, parameter file generated.');

            await createStandaloneTask(templateName, scriptPath, envFilePath);

        } else {
            //generate json file with enabled boolean + intervals (Schedule Intervals)
            // requires schedule data object
            console.log('schedule:', taskInstance.schedule);

            const jsonString = JSON.stringify(taskInstance.schedule, null, 2);
            const jsonFile = new File(server, jsonFilePath);
            // await this.ensureDir('/etc/systemd/system');
            await jsonFile.create(true, { superuser: 'require' })
                .match(
                    () => console.log(`✅ created ${jsonFilePath}`),
                    err => console.error(`❌ create json failed:`, err)
                );
            await jsonFile.write(jsonString, { superuser: 'require' })
                .match(
                    () => console.log(`✅ wrote schedule JSON`),
                    err => console.error(`❌ write schedule JSON failed:`, err)
                );
            
            await createTaskFiles(templateName, scriptPath, envFilePath, templateTimerPath, jsonFilePath);
        }
    }

    async updateTaskInstance(taskInstance: TaskInstance) {
        //populate data from env file and then delete + recreate task files
        const envKeyValues = taskInstance.parameters.asEnvKeyValues();
      //  console.log('envKeyVals:', envKeyValues);
        const templateName = formatTemplateName(taskInstance.template.name);
        let scriptPath: string;
        const envObject = this.parseEnvKeyValues(envKeyValues, templateName);
        envObject['taskName'] = taskInstance.name;

        if (templateName === 'CustomTask') {
            const pathParam = taskInstance.parameters.children.find(
                c => c.key === 'path'
            );
            scriptPath =
                (pathParam as any).value ||
                '/opt/45drives/houston/scheduler/scripts/undefined.py';
        } else {
            const scriptFileName = this.getScriptFromTemplateName(templateName);
            scriptPath = `/opt/45drives/houston/scheduler/scripts/${scriptFileName}.py`;
        }

        // Remove empty values from envObject
        const filteredEnvObject: Record<string, string> = Object.fromEntries(
            Object.entries(envObject)
                .filter(([, v]) => v !== '' && v !== '0')
        );
      //  console.log('Filtered envObject:', filteredEnvObject);

        // Convert the parsed envObject back to envKeyValuesString
        const envKeyValuesString = Object.entries(filteredEnvObject).map(([key, value]) => `${key}=${value}`).join('\n');

        const houstonSchedulerPrefix = 'houston_scheduler_';
        const envFilePath = `/etc/systemd/system/${houstonSchedulerPrefix}${templateName}_${taskInstance.name}.env`;

      //  console.log('envFilePath:', envFilePath);

        const envFile = new File(server, envFilePath);
        await envFile.create(true, { superuser: 'require' })
            .match(
                () => console.log(`✅ recreated ${envFilePath}`),
                err => console.error(`❌ recreate env failed:`, err)
            );
        await envFile.write(envKeyValuesString, { superuser: 'require' })
            .match(
                () => console.log(`✅ updated env for ${templateName}`),
                err => console.error(`❌ update env failed:`, err)
            );

        await createStandaloneTask(templateName, scriptPath, envFilePath);

        // Reload the system daemon
        let command = ['sudo', 'systemctl', 'daemon-reload'];
        let state = useSpawn(command, { superuser: 'try' });
        await state.promise();
    }

    async updateTaskNotes(taskInstance: TaskInstance) {
        //populate data from env file and then delete + recreate task files
        const templateName = formatTemplateName(taskInstance.template.name);

        const houstonSchedulerPrefix = 'houston_scheduler_';
        const notesFilePath = `/etc/systemd/system/${houstonSchedulerPrefix}${templateName}_${taskInstance.name}.txt`;

        console.log('notesFilePath:', notesFilePath);

        const notesFile = new File(server, notesFilePath);
        await notesFile.create(true, { superuser: 'require' })
            .match(
                () => console.log(`✅ recreated ${notesFilePath}`),
                err => console.error(`❌ recreate notes failed:`, err)
            );
        await notesFile.write(taskInstance.notes, { superuser: 'require' })
            .match(
                () => console.log(`✅ updated notes for ${templateName}`),
                err => console.error(`❌ update notes failed:`, err)
            );

        // Reload the system daemon
        let command = ['sudo', 'systemctl', 'daemon-reload'];
        let state = useSpawn(command, { superuser: 'try' });
        await state.promise();
    }

    async unregisterTaskInstance(taskInstance: TaskInstanceType) {
        //delete task + associated files
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = formatTemplateName(taskInstance.template.name);
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;
        if (taskInstance.schedule.enabled) {
            await this.disableSchedule(taskInstance);
        }
        await removeTask(fullTaskName);
        console.log(`${fullTaskName} removed`);
    }
    
    async runTaskNow(taskInstance: TaskInstanceType) {
        //execute service file now
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = formatTemplateName(taskInstance.template.name);
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        console.log(`Running ${fullTaskName}...`);
        await runTask(fullTaskName);
        console.log(`Task ${fullTaskName} completed.`);
        // return TaskExecutionResult;
    }

    async getTimerStatus(taskInstance: TaskInstanceType) {
        const taskLog = new TaskExecutionLog([]);
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = formatTemplateName(taskInstance.template.name);
        const fullTaskName = houstonSchedulerPrefix + templateName + '_' + taskInstance.name;

        try {
            const command = ['systemctl', 'status', `${fullTaskName}.timer`, '--no-pager', '--output=cat'];
            const state = useSpawn(command, { superuser: 'try' });
            const result = await state.promise();
            const output = result.stdout!;

            return this.parseTaskStatus(output, fullTaskName, taskLog, taskInstance);
        } catch (error) {
            console.error(`Error checking timer status:`, error);
            return 'Error checking timer status';
        }
    }


    async getServiceStatus(taskInstance: TaskInstanceType) {
        const taskLog = new TaskExecutionLog([]);
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = formatTemplateName(taskInstance.template.name);
        const fullTaskName = houstonSchedulerPrefix + templateName + '_' + taskInstance.name;

        try {
            const command = ['systemctl', 'status', `${fullTaskName}.service`, '--no-pager', '--output=cat'];
            const state = useSpawn(command, { superuser: 'try' });
            const result = await state.promise();
            const output = result.stdout!;

            // Return the parsed status based on stdout
            return this.parseTaskStatus(output, fullTaskName, taskLog, taskInstance);
        } catch (error: any) {
            // Only log real errors, not status-related cases
            // console.error(`Error checking service status:`, error);
            return this.parseTaskStatus(error.stdout || '', fullTaskName, taskLog, taskInstance); // Use error.stdout if available
        }
    }



    async parseTaskStatus(output: string, fullTaskName: string, taskLog: TaskExecutionLog, taskInstance: TaskInstanceType) {
        try {
            let status = '';
            const activeStatusRegex = /^\s*Active:\s*(\w+\s*\([^)]*\))/m;
            const activeStatusMatch = output.match(activeStatusRegex);
            const succeededRegex = new RegExp(`${fullTaskName}.service: Succeeded`, 'm');

            if (activeStatusMatch) {
                const systemdState = activeStatusMatch[1]!.trim();

                // Match the systemctl state to internal task states
                switch (systemdState) {
                    case 'activating (start)':
                        status = 'Starting...';
                        break;
                    case 'active (waiting)':
                        status = 'Active (Pending)';
                        break;
                    case 'active (running)':
                        status = 'Active (Running)';
                        break;
                    case 'inactive (dead)':
                        // Check if the task has succeeded
                        if (succeededRegex.test(output)) {
                            status = 'Completed';
                        } else {
                            const recentlyCompleted = await taskLog.wasTaskRecentlyCompleted(taskInstance);
                            status = recentlyCompleted ? 'Completed' : 'Inactive (Disabled)';
                        }
                        break;
                    case 'failed (result)':
                        status = 'Failed';
                        break;
                    default:
                        status = systemdState;  // Fallback to systemctl state if nothing matches
                }
            } else {
                // No valid status found
                status = "Unit inactive or not found.";
            }


            // console.log(`Status for ${fullTaskName}`, status);
            return status;
        } catch (error) {
            console.error(`Error parsing status for ${fullTaskName}:`, error);
            return false;
        }
    }


    async enableSchedule(taskInstance: TaskInstance) {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = formatTemplateName(taskInstance.template.name);
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        const timerName = `${fullTaskName}.timer`;
        try {
            // Reload the system daemon
            let command = ['sudo', 'systemctl', 'daemon-reload'];
            let state = useSpawn(command, { superuser: 'try' });
            await state.promise();

            // Start and Enable the timer
            command = ['sudo', 'systemctl', 'enable', timerName];
            state = useSpawn(command, { superuser: 'try' });
            await state.promise();

            console.log(`${timerName} has been enabled and started`);
            taskInstance.schedule.enabled = true;
          //  console.log('taskInstance after enable:', taskInstance);
            await this.updateSchedule(taskInstance);
        } catch (error) {
            console.error(errorString(error));
        }
    }

    async disableSchedule(taskInstance: TaskInstance) {
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const templateName = formatTemplateName(taskInstance.template.name);
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;

        const timerName = `${fullTaskName}.timer`;
        try {
            // Reload systemd daemon
            let reloadCommand = ['sudo', 'systemctl', 'daemon-reload'];
            let reloadState = useSpawn(reloadCommand, { superuser: 'try' });
            await reloadState.promise();

            // Stop and Disable the timer
            let stopCommand = ['sudo', 'systemctl', 'stop', timerName];
            let stopState = useSpawn(stopCommand, { superuser: 'try' });
            await stopState.promise();


            let disableCommand = ['sudo', 'systemctl', 'disable', timerName];
            let disableState = useSpawn(disableCommand, { superuser: 'try' });
            await disableState.promise();
    
            console.log(`${timerName} has been stopped and disabled`);
            taskInstance.schedule.enabled = false;
          //  console.log('taskInstance after disable:', taskInstance);


            await this.updateSchedule(taskInstance);

        } catch (error) {
            console.error(errorString(error));
        }
    }

    async updateSchedule(taskInstance: TaskInstance) {
        const templateName = formatTemplateName(taskInstance.template.name);

        const templateTimerPath = `/opt/45drives/houston/scheduler/templates/Schedule.timer`;
        const houstonSchedulerPrefix = 'houston_scheduler_';
        const fullTaskName = `${houstonSchedulerPrefix}${templateName}_${taskInstance.name}`;
        const jsonFilePath = `/etc/systemd/system/${fullTaskName}.json`;
      //  console.log('jsonFilePath:', jsonFilePath);

        const jsonString = JSON.stringify(taskInstance.schedule, null, 2);

        const jsonFile = new File(server, jsonFilePath);
        await jsonFile.create(true, { superuser: 'require' })
            .match(
                () => console.log(`✅ recreated ${jsonFilePath}`),
                err => console.error(`❌ recreate json failed:`, err)
            );
        await jsonFile.write(jsonString, { superuser: 'require' })
            .match(
                () => console.log(`✅ updated schedule JSON`),
                err => console.error(`❌ update JSON failed:`, err)
            );

        if (taskInstance.schedule.enabled) {
            await createScheduleForTask(fullTaskName, templateTimerPath, jsonFilePath);

            // Reload the system daemon
            let command = ['sudo', 'systemctl', 'daemon-reload'];
            let state = useSpawn(command, { superuser: 'try' });
            await state.promise();

            command = ['sudo', 'systemctl', 'restart', fullTaskName + '.timer'];
            state = useSpawn(command, { superuser: 'try' });
            await state.promise();
        }
    }

    parseIntervalIntoString(interval: TaskScheduleInterval) {
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

        function formatUnit(value: any, type: any) {
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

        // Special case for "at midnight"
        if (formattedMinute === null && formattedHour === 'at midnight') {
            elements.push('at midnight');
        } else {
            if (formattedMinute) elements.push(formattedMinute);
            if (formattedHour) elements.push(formattedHour);
        }

        const day = interval.day ? formatUnit(interval.day.value.toString(), 'day') : "every day";
        const month = interval.month ? formatUnit(interval.month.value.toString(), 'month') : "every month";
        const year = interval.year ? formatUnit(interval.year.value.toString(), 'year') : "every year";

        // Push only non-null values
        if (day) elements.push(day);
        if (month) elements.push(month);
        if (year) elements.push(year)

        if (interval.dayOfWeek && interval.dayOfWeek.length > 0) {
            elements.push(`on ${interval.dayOfWeek.join(', ')}`);
        }

        return elements.filter(e => e).join(', ');
    }
}
