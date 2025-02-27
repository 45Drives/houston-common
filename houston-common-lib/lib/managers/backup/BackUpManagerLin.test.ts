import { suite, test, expect } from "vitest";

import { BackUpManagerLin } from "./BackUpManagerLin";
import { BackUpTask, TaskSchedule, backupTaskTag } from "./types";

function expectTaskEqual(a: BackUpTask, b: BackUpTask) {
  const { schedule: scheduleA, ...restA } = a;
  const { schedule: scheduleB, ...restB } = b;
  expect(restA).toEqual(restB);
  expect(scheduleA.repeatFrequency).toEqual(scheduleB.repeatFrequency);
  expect(scheduleA.startDate.getMinutes()).toEqual(
    scheduleB.startDate.getMinutes()
  );
  if (scheduleA.repeatFrequency !== "hour") {
    expect(scheduleA.startDate.getHours()).toEqual(
      scheduleB.startDate.getHours()
    );
  }
  if (scheduleA.repeatFrequency === "week") {
    expect(scheduleA.startDate.getDay()).toEqual(scheduleB.startDate.getDay());
  } else if (scheduleA.repeatFrequency === "month") {
    expect(scheduleA.startDate.getDate()).toEqual(
      scheduleB.startDate.getDate()
    );
  }
}

// using child class to expose protected methods
class BackUpManagerLinTester extends BackUpManagerLin {
  protected cronFilePath: string = "/tmp/backup-manager-test";
  protected pkexec: string = "";

  // mask reloading cron
  protected reloadCron(): void {}

  runTests() {
    const epochDate = new Date(1970, 0, 1, 0, 0);
    test("scheduleToCron", () => {
      expect(
        this.scheduleToCron({
          repeatFrequency: "hour",
          startDate: epochDate,
        })
      ).toEqual("0 * * * *");
      expect(
        this.scheduleToCron({
          repeatFrequency: "day",
          startDate: epochDate,
        })
      ).toEqual("0 0 * * *");
      expect(
        this.scheduleToCron({
          repeatFrequency: "week",
          startDate: epochDate,
        })
      ).toEqual("0 0 * * 4"); // jan 1 1970 was a Thursday
      expect(
        this.scheduleToCron({
          repeatFrequency: "month",
          startDate: epochDate,
        })
      ).toEqual("0 0 1 * *");
    });
    test("backupTaskToCron", () => {
      const task: BackUpTask = {
        schedule: {
          repeatFrequency: "hour",
          startDate: epochDate,
        },
        source: "/home/user/files",
        target: "/mnt/hl4/backup",
        mirror: false,
        description: "test description",
      };
      expect(this.backupTaskToCron(task)).toEqual(
        `0 * * * * rsync --archive '/home/user/files' '/mnt/hl4/backup' # ${backupTaskTag} test description`
      );
      task.mirror = true;
      expect(this.backupTaskToCron(task)).toEqual(
        `0 * * * * rsync --archive --delete '/home/user/files' '/mnt/hl4/backup' # ${backupTaskTag} test description`
      );
    });
    test("cronToBackupTask", () => {
      expectTaskEqual(
        this.cronToBackupTask(
          `0 * * * * rsync --archive '/home/user/files' '/mnt/hl4/backup' # ${backupTaskTag} test description`
        ),
        {
          schedule: {
            repeatFrequency: "hour",
            startDate: epochDate,
          },
          source: "/home/user/files",
          target: "/mnt/hl4/backup",
          mirror: false,
          description: "test description",
        }
      );
      expectTaskEqual(
        this.cronToBackupTask(
          `0 * * * * rsync --archive --delete '/home/user/files' '/mnt/hl4/backup' # ${backupTaskTag} test description`
        ),
        {
          schedule: {
            repeatFrequency: "hour",
            startDate: epochDate,
          },
          source: "/home/user/files",
          target: "/mnt/hl4/backup",
          mirror: true,
          description: "test description",
        }
      );

      expectTaskEqual(
        this.cronToBackupTask(
          `0 0 * * * rsync --archive '/home/user/files' '/mnt/hl4/backup' # ${backupTaskTag} test description`
        ),
        {
          schedule: {
            repeatFrequency: "day",
            startDate: epochDate,
          },
          source: "/home/user/files",
          target: "/mnt/hl4/backup",
          mirror: false,
          description: "test description",
        }
      );
      expectTaskEqual(
        this.cronToBackupTask(
          `0 0 * * 4 rsync --archive '/home/user/files' '/mnt/hl4/backup' # ${backupTaskTag} test description`
        ),
        {
          schedule: {
            repeatFrequency: "week",
            startDate: epochDate,
          },
          source: "/home/user/files",
          target: "/mnt/hl4/backup",
          mirror: false,
          description: "test description",
        }
      );
      expectTaskEqual(
        this.cronToBackupTask(
          `0 0 1 * * rsync --archive '/home/user/files' '/mnt/hl4/backup' # ${backupTaskTag} test description`
        ),
        {
          schedule: {
            repeatFrequency: "month",
            startDate: epochDate,
          },
          source: "/home/user/files",
          target: "/mnt/hl4/backup",
          mirror: false,
          description: "test description",
        }
      );
    });
  }
}

suite("BackupManager", () => {
  suite("Linux", () => {
    new BackUpManagerLinTester().runTests();
  });
});
