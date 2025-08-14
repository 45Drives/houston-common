/**
 * Time Units for scheduling intervals
 */
export type TimeUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';

/**
 * Days of the Week
 */
export type DayOfWeek = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

/**
 * Component representing a time value (e.g., minute, hour)
 */
export interface TimeComponentType {
    value: string;
}

/**
 * Single schedule interval, keyed by time units and optional days of week
 */
export type TaskScheduleIntervalType = {
    [K in TimeUnit]?: TimeComponentType;
} & {
    dayOfWeek?: DayOfWeek[];
};

/**
 * Overall schedule configuration for a task instance
 */
export interface TaskScheduleType {
    enabled: boolean;
    intervals: TaskScheduleIntervalType[];
}

/**
 * Basic interface for a scheduler, managing templates and instances
 */
export interface SchedulerType {
    taskTemplates: TaskTemplateType[];
    taskInstances: TaskInstanceType[];

    loadTaskInstances(): Promise<void>;
    createParameterNodeFromSchema(schema: ParameterNodeType, parameters: any): ParameterNodeType;
    registerTaskInstance(taskInstance: TaskInstanceType): Promise<void>;
    updateTaskInstance(taskInstance: TaskInstanceType): Promise<void>;
    runTaskNow(taskInstance: TaskInstanceType): Promise<void>;
    unregisterTaskInstance(taskInstance: TaskInstanceType): Promise<void>;
    getServiceStatus(taskInstance: TaskInstanceType): Promise<string | false>;
    getTimerStatus(taskInstance: TaskInstanceType): Promise<string | false>;
    enableSchedule(taskInstance: TaskInstanceType): Promise<void>;
    disableSchedule(taskInstance: TaskInstanceType): Promise<void>;
    updateSchedule(taskInstance: TaskInstanceType): Promise<void>;
    parseIntervalIntoString(interval: TaskScheduleIntervalType): string;
}

/**
 * Template defining how task instances are created
 */
export interface TaskTemplateType {
    name: string;
    parameterSchema: ParameterNodeType;

    createTaskInstance(parameters: ParameterNodeType): TaskInstanceType;
}

/**
 * Concrete instance of a scheduled task
 */
export interface TaskInstanceType {
    name: string;
    template: TaskTemplateType;
    parameters: ParameterNodeType;
    schedule: TaskScheduleType;
    notes: string;
}

/**
 * Base node for location parameter
 */
export interface LocationType {
    host: string;
    port: number;
    user?: string;
    root: string;
    path: string;
}

/**
 * Base node for parameter trees
 */
export interface ParameterNodeType {
    label: string;
    key: string;
    children: ParameterNodeType[];
    value?: any;

    addChild(child: ParameterNodeType): ParameterNodeType;
    asEnvKeyValues(): string[];
}

/**
 * Option type for selection parameters
 */
export interface SelectionOptionType {
    value: string | number | boolean;
    label: string;
}

/**
 * Parameter node representing a selection
 */
export interface SelectionParameterType extends ParameterNodeType {
    value: string;
    options: SelectionOptionType[];

    addOption(option: SelectionOptionType): void;
    asEnvKeyValues(): string[];
}

/**
 * Parameter node representing a string
 */
export interface StringParameterType extends ParameterNodeType {
    value: string;

    asEnvKeyValues(): string[];
}

/**
 * Parameter node representing a boolean
 */
export interface BoolParameterType extends ParameterNodeType {
    value: boolean;

    asEnvKeyValues(): string[];
}

/**
 * Parameter node representing an integer
 */
export interface IntParameterType extends ParameterNodeType {
    value: number;

    asEnvKeyValues(): string[];
}

/**
 * Log of executions for a task instance
 */
export interface TaskExecutionLogType {
    entries: TaskExecutionResultType[];

    getEntriesFor(taskInstance: TaskInstanceType, untilTime: string): Promise<string>;
    getLatestEntryFor(taskInstance: TaskInstanceType): Promise<TaskExecutionResultType>;
}

/**
 * Single execution result entry
 */
export interface TaskExecutionResultType {
    exitCode: number;
    output: string;
    startDate: string;
    finishDate: string;
}

/**
 * Callback signature for confirmations
 */
export type ConfirmationCallback = (param?: any) => void;

/**
 * Disk information structure
 */
export interface DiskData {
    name: string;
    capacity: string;
    model: string;
    type: string;
    health: string;
    phy_path: string;
    sd_path: string;
    vdev_path: string;
    serial: string;
    temp: string;
}

/**
 * Detailed disk path info
 */
export interface DiskDetails {
    diskName: string;
    diskPath: string;
}

/**
 * Configuration for a cloud sync remote
 */
export interface CloudSyncRemoteType {
    name: string;
    type: string;
    authParams: CloudAuthParameterType;
}

/**
 * Authentication parameters for cloud sync
 */
export interface CloudAuthParameterType {
    parameters: Record<string, CloudSyncParameterType>;
    provider?: string;
    oAuthSupported?: boolean;
}

/**
 * Single parameter for cloud sync
 */
export interface CloudSyncParameterType {
    value: any;
    type: 'string' | 'bool' | 'int' | 'select' | 'object';
    allowedValues?: string[];
    defaultValue?: string | number | boolean | object;
}

/**
 * Manager for cloud sync remotes
 */
export interface RemoteManagerType {
    cloudSyncRemotes: CloudSyncRemoteType[];

    getRemotes(): Promise<void>;
    getRemoteByName(remoteName: string): Promise<CloudSyncRemoteType | null>;
    createRemote(
        label: string,
        key: string,
        name: string,
        type: string,
        parameters: any
    ): Promise<CloudSyncRemoteType>;
    editRemote(
        key: string,
        newLabel: string,
        oldName: string,
        newType: string,
        parameters: any
    ): Promise<CloudSyncRemoteType>;
    deleteRemote(key: string): Promise<boolean>;
}
