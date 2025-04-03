import { ResultAsync, ok, okAsync, err, errAsync } from "neverthrow";
import { Command, Process, ExitedProcess, PythonCommand } from "@/process";
import { User, LocalUser, isLocalUser, NewUser } from "@/user";
import { Group, LocalGroup, isLocalGroup } from "@/group";
import { Directory, File } from "@/path";
import { ParsingError, ProcessError, ValueError } from "@/errors";
import { Download } from "@/download";
import { safeJsonParse } from "./utils";
import { assertProp } from "./utils";

import DiskInfoPy from "@/scripts/disk_info.py?raw";
import { lookupServerModel, ServerModel } from "@/serverModels";

import {
  DriveSlot,
  getDriveSlots,
  GetDriveSlotsOpts,
  LiveDriveSlotsOpts,
  startLiveDriveSlotsWatcher,
  type Drive,
} from "@/driveSlots";
import { HoustonDriver } from "@/driver";

export type ServerInfo = {
  Motherboard: {
    Manufacturer: string;
    ["Product Name"]: string;
    ["Serial Number"]: string;
  };
  HBA: {
    Model: string;
    Adapter: string;
    "Bus Address": string;
    "Drive Connections": number;
    "Kernel Driver": string;
    "PCI Slot": number;
  }[];
  Hybrid: boolean;
  Serial: string;
  Model: string;
  "Alias Style": string;
  "Chassis Size": string;
  VM: boolean;
  "Edit Mode": boolean;
  "OS NAME": string;
  "OS VERSION_ID": string;
};

export type DiskInfo = {
  rows: (
    | ({
        "dev-by-path": string;
        "bay-id": `${number}-${number}`;
      } & {
        occupied: true;
        dev: string;
        disk_type: "HDD" | "SSD";
      })
    | { occupied: false }
  )[];
};

export type LSDevDisk = {
  "dev-by-path": string;
  "bay-id": string;
  occupied: boolean;
  dev: string;
  partitions: number;
  "model-family": string;
  "model-name": string;
  serial: string;
  capacity: string;
  "firm-ver": string;
  "rotation-rate": number;
  "start-stop-count": string;
  "power-cycle-count": string;
  "temp-c": string;
  "current-pending-sector": string;
  "offline-uncorrectable": string;
  "power-on-time": string;
  health: string;
  disk_type: "HDD" | "SSD";
};

export class Server {
  public readonly host?: string;
  private hostname?: string;
  private ipAddress?: string;
  private localUsers?: LocalUser[];
  private localGroups?: LocalGroup[];

  constructor(host?: string) {
    this.host = host;
  }

  isAccessible(): ResultAsync<true, ProcessError> {
    return this.execute(new Command(["true"]), true).map(() => true);
  }

  /**
   * Get contents of /etc/45drives/server_info/server_info.json (generated by dmap)
   * @returns
   */
  getServerInfo(): ResultAsync<ServerInfo, ProcessError | SyntaxError> {
    return new File(this, "/etc/45drives/server_info/server_info.json")
      .read()
      .andThen(safeJsonParse<ServerInfo>)
      .andThen(assertProp("Alias Style"))
      .andThen(assertProp("Chassis Size"))
      .andThen(assertProp("Edit Mode"))
      .andThen(assertProp("HBA"))
      .andThen(assertProp("Hybrid"))
      .andThen(assertProp("Model"))
      .andThen(assertProp("Motherboard"))
      .andThen(assertProp("OS NAME"))
      .andThen(assertProp("OS VERSION_ID"))
      .andThen(assertProp("Serial"))
      .andThen(assertProp("VM"));
  }

  /**
   * Get information on the system's drives and slots.
   * @see DriveSlot
   * @see Drive
   * @see SmartInfo
   * @returns Array of drive slot information
   */
  getDriveSlots(
    opts?: GetDriveSlotsOpts & { excludeEmpty?: false }
  ): ResultAsync<DriveSlot[], ProcessError | SyntaxError>;
  /**
   * Get information on the system's drives and slots, excluding empty slots.
   * @see DriveSlot
   * @see Drive
   * @see SmartInfo
   * @returns Array of drive slot information
   */
  getDriveSlots(
    opts: GetDriveSlotsOpts & { excludeEmpty: true }
  ): ResultAsync<(DriveSlot & { drive: Drive })[], ProcessError | SyntaxError>;
  getDriveSlots(opts: GetDriveSlotsOpts = {}) {
    if (opts.excludeEmpty) {
      return getDriveSlots(this, { ...opts, excludeEmpty: true });
    }
    return getDriveSlots(this, { ...opts, excludeEmpty: false });
  }

  /**
   * Set up live view of system drive slots.
   * @param setter This callback will be called once initially and every time a disk is added or removed
   * @param opts Options (e.g. includeNonAliased)
   * @returns LiveDriveSlotsHandle to stop watcher
   *
   * @example
   * ```vue
   * <script setup lang="ts">
   * import { ref, onMounted, onUnmounted } from "vue";
   * import { server, DriveSlot } from "@45drives/houston-common-lib";
   *
   * const driveSlots = ref<DriveSlot[]>([]);
   * let liveDriveSlotsHandle: LiveDriveSlotsHandle;
   *
   * onMounted(() => {
   *     liveDriveSlotsHandle = server.setupLiveDriveSlotInfo((slots) => driveSlots.value = slots);
   * });
   * 
   * onUnmounted(() => {
   *     liveDriveSlotsHandle?.stop();
   * });
   * </script>
   * <template>
   *
   * </template>
   * ```
   */
  setupLiveDriveSlotInfo(setter: (slots: DriveSlot[]) => void, opts?: LiveDriveSlotsOpts) {
    return startLiveDriveSlotsWatcher(this, setter, opts);
  }

  /**
   * @deprecated use {@link Server.getDriveSlots} instead
   * @returns
   */
  getDiskInfo() {
    return this.execute(new PythonCommand(DiskInfoPy, [], { superuser: "try" }))
      .map((proc) => proc.getStdout())
      .andThen(safeJsonParse<DiskInfo>)
      .map((di) => di as DiskInfo);
  }

  /**
   * @deprecated use {@link Server.getDriveSlots} instead
   * @returns
   */
  getLsDev() {
    return this.execute(new Command(["/opt/45drives/tools/lsdev", "--json"], { superuser: "try" }))
      .map((proc) => proc.getStdout())
      .andThen(safeJsonParse<{ rows: LSDevDisk[][] }>)
      .map((lsdev) => lsdev as { rows: LSDevDisk[][] });
  }

  getServerModel(): ResultAsync<ServerModel, ProcessError | ParsingError> {
    return this.getServerInfo().andThen((serverInfo) => {
      const model = lookupServerModel(serverInfo.Model);
      if (!model) {
        return err(new ParsingError(`Model lookup failed: ${serverInfo.Model}`));
      }
      return ok(model);
    });
  }

  getHostname(cache: boolean = true): ResultAsync<string, ProcessError> {
    if (this.hostname === undefined || cache === false) {
      return this.execute(new Command(["hostname"]), true).map(
        (proc) => (this.hostname = proc.getStdout().trim())
      );
    }
    return okAsync(this.hostname);
  }

  setHostname(hostname: string): ResultAsync<null, ProcessError> {
    if (this.hostname === undefined || this.hostname !== hostname) {
      return this.execute(new Command(["hostnamectl", "set-hostname", hostname], { superuser: "try" }))
        .orElse((err) => {
          if (err.message.includes("Could not set property: Access denied")) {
            return this.execute(new Command(["hostnamectl", "set-hostname", hostname], { superuser: "try" }));
          }
          return errAsync(err);
        })
        .map(() => null)
        .orElse(() => okAsync(null));
    }
    return okAsync(null);
  }

  writeHostnameFiles(hostname: string): ResultAsync<null, ProcessError> {
    console.log(`Writing hostname files for: ${hostname}`);

    return this.execute(new Command(["sh", "-c", `echo '${hostname}' > /etc/hostname`], { superuser: "try" }))
      .map((result) => {
        console.log("Successfully wrote to /etc/hostname");
        return result;
      })
      .orElse((err) => {
        console.log("Failed to write to /etc/hostname:", err.message);
        return errAsync(err);
      })
      .andThen(() => {
        console.log("Writing pretty hostname to /etc/machine-info");
        return this.execute(
          new Command(["sh", "-c", `echo 'PRETTY_HOSTNAME=\"${hostname}\"' > /etc/machine-info`], {
            superuser: "try",
          })
        )
          .map((result) => {
            console.log("Successfully wrote to /etc/machine-info");
            return result;
          })
          .orElse((err) => {
            console.log("Failed to write to /etc/machine-info:", err.message);
            return errAsync(err);
          });
      })
      .map(() => null)
      .orElse(() => okAsync(null)); // Ignore any errors and return null in the end
  }

  getIpAddress(cache: boolean = true): ResultAsync<string, ProcessError | ParsingError> {
    if (this.ipAddress === undefined || cache === false) {
      const target = "1.1.1.1";
      return this.execute(new Command(["ip", "route", "get", target]), true).andThen((proc) => {
        const stdout = proc.getStdout();
        const match = stdout.match(/\bsrc\s+(?<ipAddress>\d{1,3}(?:\.\d{1,3}){3})\b/);
        if (match === null || match.groups === undefined) {
          return err(new ParsingError(`Malformed output from ${proc}`, { cause: stdout }));
        }
        this.ipAddress = match.groups["ipAddress"] as string;
        return ok(this.ipAddress);
      });
    }
    return okAsync(this.ipAddress);
  }

  spawnProcess(command: Command, defer: boolean = false): Process {
    return new Process(this, command, defer);
  }

  execute(
    command: Command,
    failIfNonZero: boolean = true
  ): ResultAsync<ExitedProcess, ProcessError> {
    return this.spawnProcess(command).wait(failIfNonZero);
  }

  downloadCommandOutput(command: Command, filename: string): void {
    const url = HoustonDriver.downloadCommandOutputURL(this, command, filename);
    Download.url(url, filename);
  }

  getLocalUsers(cache: boolean = true): ResultAsync<LocalUser[], ProcessError> {
    if (this.localUsers === undefined || cache === false) {
      return this.execute(new Command(["getent", "-s", "files", "passwd"]), true).map((proc) => {
        this.localUsers = proc
          .getStdout()
          .split("\n")
          .map((line) => {
            const [login, _, uidStr, gidStr, name, home, shell] = line.split(":");
            if (
              login === undefined ||
              uidStr === undefined ||
              gidStr === undefined ||
              name === undefined ||
              home === undefined ||
              shell === undefined
            ) {
              return null;
            }
            const uid = parseInt(uidStr);
            const gid = parseInt(gidStr);
            if (isNaN(uid) || isNaN(gid)) {
              return null;
            }
            return User(
              this,
              login,
              uid,
              gid,
              name,
              new Directory(this, home),
              new File(this, shell)
            );
          })
          .filter((user): user is LocalUser => user !== null);
        return this.localUsers;
      });
    }
    return okAsync(this.localUsers);
  }

  getLocalGroups(cache: boolean = true): ResultAsync<LocalGroup[], ProcessError> {
    if (this.localGroups === undefined || cache === false) {
      return this.execute(new Command(["getent", "-s", "files", "group"]), true).map((proc) => {
        this.localGroups = proc
          .getStdout()
          .split("\n")
          .map((line) => {
            const [name, _, gidStr, membersStr] = line.split(":");
            if (name === undefined || gidStr === undefined || membersStr === undefined) {
              return null;
            }
            const gid = parseInt(gidStr);
            if (isNaN(gid)) {
              return null;
            }
            return Group(this, name, gid, membersStr.split(","));
          })
          .filter((group): group is LocalGroup => group !== null);
        return this.localGroups;
      });
    }
    return okAsync(this.localGroups);
  }

  getUserGroups(user: User): ResultAsync<LocalGroup[], ProcessError | ValueError> {
    if (!isLocalUser(user)) {
      return errAsync(new ValueError(`Can't get groups from non-local user ${user.uid}`));
    }
    return this.execute(new Command(["groups", user.login]), true)
      .map((proc) =>
        proc
          .getStdout()
          /* remove "user : " present in some distros */
          .replace(/^[^:]+:/, "")
          .trim()
          .split(/\s+/)
      )
      .andThen((userGroupNames) => {
        return this.getLocalGroups().map((localGroups) =>
          localGroups.filter((group) => group.name in userGroupNames)
        );
      });
  }

  getGroupMembers(group: Group): ResultAsync<LocalUser[], ProcessError | ValueError> {
    if (!isLocalGroup(group)) {
      return errAsync(new ValueError(`Can't get members of non-local group ${group.gid}`));
    }
    return this.getLocalUsers().map((localUsers) =>
      localUsers.filter((user) => user.login in group.members)
    );
  }

  getUserByLogin(login: string): ResultAsync<LocalUser, ProcessError | ValueError> {
    return this.getLocalUsers()
      .map((localUsers) => localUsers.filter((user) => user.login === login))
      .andThen((userMatches) =>
        userMatches.length === 0
          ? err(new ValueError(`User not found: ${login}`))
          : ok(userMatches[0]!)
      );
  }

  getUserByUid(uid: number): ResultAsync<User, ProcessError> {
    return this.getLocalUsers()
      .map((localUsers) => localUsers.filter((user) => user.uid === uid))
      .andThen((userMatches) =>
        userMatches.length === 0
          ? ok(User(this, undefined, uid, undefined, undefined, undefined, undefined))
          : ok(userMatches[0]!)
      );
  }

  getGroupByName(groupName: string): ResultAsync<LocalGroup, ProcessError | ValueError> {
    return this.getLocalGroups()
      .map((localGroups) => localGroups.filter((group) => group.name === groupName))
      .andThen((groupMatches) =>
        groupMatches.length === 0
          ? err(new ValueError(`Group not found: ${groupName}`))
          : ok(groupMatches[0]!)
      );
  }

  getGroupByGid(gid: number): ResultAsync<Group, ProcessError> {
    return this.getLocalGroups()
      .map((localGroups) => localGroups.filter((group) => group.gid === gid))
      .andThen((groupMatches) =>
        groupMatches.length === 0
          ? ok(Group(this, undefined, gid, undefined))
          : ok(groupMatches[0]!)
      );
  }

  addUser(user: NewUser): ResultAsync<LocalUser, ProcessError> {
    const argv = ["useradd", "--create-home"];
    if (user.name) {
      argv.push("--comment", user.name);
    }
    if (user.home) {
      argv.push("--home", user.home);
    }
    if (user.shell) {
      argv.push("--shell", user.shell);
    }
    argv.push(user.login);

    return this.execute(new Command(argv, { superuser: "try" }), true).andThen(() =>
      this.getUserByLogin(user.login)
    );
  }

  changePassword(user: LocalUser, password: string): ResultAsync<LocalUser, ProcessError> {
    const proc = this.spawnProcess(new Command(["passwd", user.login], { superuser: "try" }));
    proc.write(`${password}\n${password}\n`);

    return proc.wait().map(() => user);
  }

  createGroup(group: string): ResultAsync<LocalGroup, ProcessError> {
    return this.execute(new Command(["groupadd", group], { superuser: "try" }), true)
      .andThen(() => this.getGroupByName(group));
  }


  addUserToGroups(
    user: LocalUser,
    ...groups: [string, ...string[]]
  ): ResultAsync<LocalUser, ProcessError> {
    return this.execute(new Command(["usermod", "-aG", groups.join(","), user.login])).map(
      () => user
    );
  }

  toString(): string {
    return `Server(${this.host ?? "localhost"})`;
  }

  isServerDomainJoined(): ResultAsync<boolean, ProcessError> {
    return this.execute(new Command(["net", "ads", "testjoin"], { superuser: "try" }), false)
      .map((proc) => {
        const output = (proc.getStdout() + proc.getStderr()).toLowerCase();
        return output.includes("join is ok") || output.includes("join to domain is not valid");
      });
  }

  reboot(): ResultAsync<null, ProcessError> {
    return this.execute(new Command(['reboot', 'now'], { superuser: 'try' }))
      .map(() => {
        console.log(`${this.toString()}: Reboot triggered.`);
        return null;
      })
      .orElse((err) => {
        console.error(`${this.toString()}: Failed to trigger reboot`, err);
        return errAsync(err);
      });
  }
}
