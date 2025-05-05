
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
}

export interface BackUpSetupConfig {
  backUpTasks: BackUpTask[]
  username: string
  password: string
}


export const backupTaskTag = "houston-client-manager-backup-task"

export interface FileEntry {
  path: string
  selected: boolean
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