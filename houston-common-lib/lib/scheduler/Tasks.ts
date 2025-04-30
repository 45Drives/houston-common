import {
    TaskInstanceType,
    TaskTemplateType,
    TaskScheduleType,
    TaskScheduleIntervalType,
    ParameterNodeType,
    DayOfWeek
} from './types';
import {
    ParameterNode,
    ZfsDatasetParameter,
    StringParameter,
    BoolParameter,
    IntParameter,
    SelectionParameter,
    SelectionOption,
    SnapshotRetentionParameter,
    LocationParameter
} from './Parameters';
import { cloudSyncProviders } from './CloudSync';

/**
 * Concrete task instance
 */
export class TaskInstance implements TaskInstanceType {
    constructor(
        public name: string,
        public template: TaskTemplateType,
        public parameters: ParameterNodeType,
        public schedule: TaskScheduleType,
        public notes: string
    ) { }
}

/**
 * Schedule configuration for a task instance
 */
export class TaskSchedule implements TaskScheduleType {
    constructor(
        public enabled: boolean,
        public intervals: TaskScheduleInterval[]
    ) { }
}

/**
 * Single interval in a task's schedule
 */
export class TaskScheduleInterval implements TaskScheduleIntervalType {
    [key: string]: any;
    dayOfWeek?: DayOfWeek[];

    constructor(intervalData: TaskScheduleIntervalType) {
        Object.assign(this, intervalData);
    }
}

/**
 * Base template class for tasks
 */
export class TaskTemplate implements TaskTemplateType {
    constructor(
        public name: string,
        public parameterSchema: ParameterNodeType
    ) { }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}

/**
 * ZFS Replication Task
 */
export class ZFSReplicationTaskTemplate extends TaskTemplate implements TaskTemplateType {
    constructor() {
        const name = 'ZFS Replication Task';
        const parameterSchema = new ParameterNode('ZFS Replication Task Config', 'zfsRepConfig')
            .addChild(new ZfsDatasetParameter('Source Dataset', 'sourceDataset'))
            .addChild(new ZfsDatasetParameter('Destination Dataset', 'destDataset'))
            .addChild(
                new ParameterNode('Send Options', 'sendOptions')
                    .addChild(new BoolParameter('Compressed', 'compressed_flag', false))
                    .addChild(new BoolParameter('Raw', 'raw_flag', false))
                    .addChild(new BoolParameter('Recursive', 'recursive_flag', false))
                    .addChild(new IntParameter('MBuffer Size', 'mbufferSize', 1))
                    .addChild(new StringParameter('MBuffer Unit', 'mbufferUnit', 'G'))
                    .addChild(new BoolParameter('Custom Name Flag', 'customName_flag', false))
                    .addChild(new StringParameter('Custom Name', 'customName', ''))
                    .addChild(new StringParameter('Transfer Method', 'transferMethod', ''))
            )
            .addChild(
                new ParameterNode('Snapshot Retention', 'snapshotRetention')
                    .addChild(new SnapshotRetentionParameter('Source', 'source', 0, 'minutes'))
                    .addChild(new SnapshotRetentionParameter('Destination', 'destination', 0, 'minutes'))
            );
        super(name, parameterSchema);
    }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}

/**
 * Automated Snapshot Task
 */
export class AutomatedSnapshotTaskTemplate extends TaskTemplate implements TaskTemplateType {
    constructor() {
        const name = 'Automated Snapshot Task';
        const parameterSchema = new ParameterNode('Automated Snapshot Task Config', 'autoSnapConfig')
            .addChild(new ZfsDatasetParameter('Filesystem', 'filesystem'))
            .addChild(new BoolParameter('Recursive', 'recursive_flag', false))
            .addChild(new BoolParameter('Custom Name Flag', 'customName_flag', false))
            .addChild(new StringParameter('Custom Name', 'customName', ''))
            .addChild(new SnapshotRetentionParameter('Snapshot Retention', 'snapshotRetention', 0, 'minutes'));
        super(name, parameterSchema);
    }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}

/**
 * Rsync Task
 */
export class RsyncTaskTemplate extends TaskTemplate implements TaskTemplateType {
    constructor() {
        const name = 'Rsync Task';
        const directionSelection = [
            new SelectionOption('push', 'Push'),
            new SelectionOption('pull', 'Pull')
        ];
        const parameterSchema = new ParameterNode('Rsync Task Config', 'rsyncConfig')
            .addChild(new StringParameter('Local Path', 'local_path', ''))
            .addChild(new LocationParameter('Target Information', 'target_info'))
            .addChild(new SelectionParameter('Direction', 'direction', 'push', directionSelection))
            .addChild(
                new ParameterNode('Rsync Options', 'rsyncOptions')
                    .addChild(new BoolParameter('Archive', 'archive_flag', true))
                    .addChild(new BoolParameter('Recursive', 'recursive_flag', false))
                    .addChild(new BoolParameter('Compressed', 'compressed_flag', false))
                    .addChild(new BoolParameter('Delete', 'delete_flag', false))
                    .addChild(new BoolParameter('Quiet', 'quiet_flag', false))
                    .addChild(new BoolParameter('Preserve Times', 'times_flag', false))
                    .addChild(new BoolParameter('Preserve Hard Links', 'hardLinks_flag', false))
                    .addChild(new BoolParameter('Preserve Permissions', 'permissions_flag', false))
                    .addChild(new BoolParameter('Preserve Extended Attributes', 'xattr_flag', false))
                    .addChild(new IntParameter('Limit Bandwidth', 'bandwidth_limit_kbps', 0))
                    .addChild(new StringParameter('Include', 'include_pattern', ''))
                    .addChild(new StringParameter('Exclude', 'exclude_pattern', ''))
                    .addChild(new StringParameter('Additional Custom Arguments', 'custom_args', ''))
                    .addChild(new BoolParameter('Parallel Transfer', 'parallel_flag', false))
                    .addChild(new IntParameter('Threads', 'parallel_threads', 0))
            );
        super(name, parameterSchema);
    }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}

/**
 * Scrub Task
 */
export class ScrubTaskTemplate extends TaskTemplate implements TaskTemplateType {
    constructor() {
        const name = 'Scrub Task';
        const parameterSchema = new ParameterNode('Scrub Task Config', 'scrubConfig')
            .addChild(new ZfsDatasetParameter('Pool', 'pool'));
        super(name, parameterSchema);
    }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}

/**
 * Custom Task
 */
export class CustomTaskTemplate extends TaskTemplate implements TaskTemplateType {
    constructor() {
        const name = 'Custom Task';
        const parameterSchema = new ParameterNode('Custom Task Config', 'customTaskConfig')
            .addChild(new BoolParameter('FilePath Flag', 'filePath_flag', false))
            .addChild(new BoolParameter('Command Flag', 'command_flag', false))
            .addChild(new StringParameter('FilePath', 'filePath', ''))
            .addChild(new StringParameter('Command', 'command', ''));
        super(name, parameterSchema);
    }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}

/**
 * SMART Test
 */
export class SmartTestTemplate extends TaskTemplate implements TaskTemplateType {
    constructor() {
        const name = 'SMART Test';
        const parameterSchema = new ParameterNode('SMART Test Config', 'smartTestConfig')
            .addChild(new StringParameter('Disks', 'disks', ''))
            .addChild(new StringParameter('Test Type', 'testType', ''));
        super(name, parameterSchema);
    }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}

/**
 * Cloud Sync Task
 */
export class CloudSyncTaskTemplate extends TaskTemplate implements TaskTemplateType {
    constructor() {
        const name = 'Cloud Sync Task';

        const providerOptions = Object.keys(cloudSyncProviders).map(key => {
            const prov = cloudSyncProviders[key];
            return new SelectionOption(key, prov!.name);
        });

        const directionSelection = [
            new SelectionOption('push', 'Push'),
            new SelectionOption('pull', 'Pull')
        ];

        const parameterSchema = new ParameterNode('Cloud Sync Task Config', 'cloudSyncConfig')
            .addChild(new StringParameter('Local Path', 'local_path', ''))
            .addChild(new StringParameter('Target Path', 'target_path', ''))
            .addChild(new SelectionParameter('Direction', 'direction', 'push', directionSelection))
            .addChild(new SelectionParameter('Provider', 'provider', providerOptions[0]!.value as string, providerOptions))
            .addChild(
                new ParameterNode('Rclone Options', 'rcloneOptions')
                    .addChild(new BoolParameter('Check First', 'check_first_flag', false))
                    .addChild(new BoolParameter('Checksum', 'checksum_flag', false))
                // …etc…
            );
        super(name, parameterSchema);
    }

    createTaskInstance(
        parameters: ParameterNodeType
    ): TaskInstanceType {
        return new TaskInstance(
            `${this.name}-${Date.now()}`,
            this,
            parameters,
            new TaskSchedule(false, []),
            ''
        );
    }
}
