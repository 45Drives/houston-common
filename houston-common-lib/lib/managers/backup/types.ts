
export interface TaskSchedule {
  repeatFrequency: 'hour' | 'day' | 'week' | 'month'
  startDate: Date
}

export interface BackUpTask {
  schedule: TaskSchedule
  description: string     // Unique description of the task. Also programatically add ID (Houston-backup-task) so we can query
  source: string          // client folder to backup
  target: string          // mount point for backup location(preappened clientID(client hostname))
  mirror: boolean
  uuid: string
  status?:
  | 'online'
  | 'offline_unreachable'
  | 'offline_invalid_credentials'
  | 'offline_connection_error'
  | 'missing_folder'
  | 'checking'
  | 'offline_insufficient_permissions';
  share?: string
  host?: string
}

export interface BackUpSetupConfig {
  backUpTasks: BackUpTask[]
  username: string
  password: string
}


export const backupTaskTag = "houston-client-manager-backup-task"

export interface FileEntry {
  path: string;
  isDir: boolean;
  selected?: boolean;
}

export interface FileNode extends FileEntry {
  name: string;
  depth: number;
  expanded: boolean;
  children?: FileNode[];
}

export interface BackupEntry {
  uuid: string
  folder: string
  server: string
  client: string
  lastBackup: string
  onSystem: boolean
  files: FileEntry[]
}