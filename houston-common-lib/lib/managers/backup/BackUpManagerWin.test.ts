import { suite, test, expect } from "vitest";

import { BackUpManagerWin } from "./BackUpManagerWin";

// using child class to expose protected methods
class BackUpManagerWinTester extends BackUpManagerWin {

  runTests() {
    const epochDate = new Date(1970, 0, 1, 0, 0);

    // Tests for scheduleToTaskTrigger
    test("scheduleToTaskTrigger", () => {

      expect(
        this.scheduleToTaskTrigger({
          repeatFrequency: "hour",
          startDate: epochDate,
        })
      ).toEqual(`
$startTime = "1970-01-01 04:00:00"
$taskTrigger = New-ScheduledTaskTrigger -At $startTime -Daily
$taskTrigger.RepetitionInterval = (New-TimeSpan -Hours 1)
`);

      expect(
        this.scheduleToTaskTrigger({
          repeatFrequency: "day",
          startDate: epochDate,
        })
      ).toEqual(`
$startTime = "1970-01-01 04:00:00"
$taskTrigger = New-ScheduledTaskTrigger -At $startTime -Daily
$taskTrigger.RepetitionInterval = (New-TimeSpan -Days 1)
`);

      expect(
        this.scheduleToTaskTrigger({
          repeatFrequency: "week",
          startDate: epochDate,
        })
      ).toEqual(`
$startTime = "1970-01-01 04:00:00"
$taskTrigger = New-ScheduledTaskTrigger -At $startTime -Weekly
$taskTrigger.RepetitionInterval = (New-TimeSpan -Weeks 1)
`); // jan 1 1970 was a Thursday

      expect(
        this.scheduleToTaskTrigger({
          repeatFrequency: "month",
          startDate: epochDate,
        })
      ).toEqual(`
$startTime = "1970-01-01 04:00:00"
$taskTrigger = New-ScheduledTaskTrigger -At $startTime -Monthly
$taskTrigger.RepetitionInterval = (New-TimeSpan -Months 1)
`);

    });

    // Tests for convertTriggersToTaskSchedule
    test("convertTriggersToTaskSchedule", () => {

      expect(this.convertTriggersToTaskSchedule([])).toEqual(null);

      const triggers =  [
            {
              "CimClass": "Root/Microsoft/Windows/TaskSceduler:MSFT_TaskDialyTrigger",
              "CimInstanceProperties": 'Enabled = True EndBoundary ExecutionTimeLimit Id repetition = ... StartBoundary = "2025-02-24T08:00" DaysInterval = 1 RandomDelay',
              "CimSystemProperties": "Microsoft.Management.Infrastructure.CimSystemProperties"
            }
          ];

      expect(this.convertTriggersToTaskSchedule(triggers)).toEqual(
        {
          repeatFrequency: "day",
          startDate: new Date("2025-02-24T08:00")
        }
      );

    });

    // Tests for parseRobocopyCommand
    test("parseRobocopyCommand", () => {

      expect(this.parseRobocopyCommand('robocopy C:\\source\\folder D:\\backup\\folder /Z /XA:H /R:3 /W:5')).toEqual(
        {
          source: "C:\\source\\folder",
          target: "D:\\backup\\folder",
          mirror: false
        }
      );

      expect(this.parseRobocopyCommand('robocopy C:\\source\\folder D:\\backup\\folder /MIR /Z /XA:H /R:3 /W:5')).toEqual(
        {
          source: "C:\\source\\folder",
          target: "D:\\backup\\folder",
          mirror: true
        }
      );

    });
  }
}

suite("BackupManager", () => {
  suite("Windows", () => {
    new BackUpManagerWinTester().runTests();
  });
});
