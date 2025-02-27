export interface BackUpManager {
  queryTasks(): BackUpTask[]
  unschedule(task: BackUpTask): void
  schedule(task: BackUpTask): void
}

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
}

export interface BackUpSetupConfig {
  backUpTasks: BackUpTask[]
}

export const backupTaskTag = "houston-client-manager-backup-task"

/**
 * WinBackUpManager
 * * schtasks
 * * robocopy
 * 
 * LinuxBackUpManager
 * * systemd
 * * rsync
 * 
 * MacBackUpManager
 * * launchd
 * * rsync
 * 
 */
