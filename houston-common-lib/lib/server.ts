import { ResultAsync, ok, okAsync, err, errAsync } from "neverthrow";
import { Command, Process, ExitedProcess, PythonCommand } from "@/process";
import { User, LocalUser, isLocalUser } from "@/user";
import { Group, LocalGroup, isLocalGroup } from "@/group";
import { Directory, File } from "@/path";
import { ParsingError, ProcessError, ValueError } from "@/errors";
import { Download } from "@/download";
import { safeJsonParse } from "./utils";
import { assertProp } from "./utils";

import DiskInfoPy from "@/scripts/disk_info.py?raw";

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
  rows: {
    "dev-by-path": string;
    "bay-id": `${number}-${number}`;
    occupied: boolean;
    dev: string;
    disk_type: "HDD" | "SSD";
  }[];
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

  getDiskInfo() {
    return this.execute(new PythonCommand(DiskInfoPy, [], { superuser: "try" }))
      .map((proc) => proc.getStdout())
      .andThen(safeJsonParse<DiskInfo>);
  }

  getLsDev() {
    return this.execute(new Command(["/opt/45drives/tools/lsdev", "--json"], { superuser: "try" }))
      .map((proc) => proc.getStdout())
      .andThen(safeJsonParse<any>);
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
      return this.execute(new Command(["hostnamectl", "set-hostname", hostname]), true).map(
        () => null
      );
    }
    return okAsync(null);
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
    const query = window.btoa(
      JSON.stringify({
        ...command.spawnOptions,
        host: this.host,
        payload: "stream",
        binary: "raw",
        spawn: command.argv,
        external: {
          "content-disposition": 'attachment; filename="' + encodeURIComponent(filename) + '"',
          "content-type": "application/x-xz, application/octet-stream",
        },
      })
    );
    const prefix = new URL(cockpit.transport.uri("channel/" + cockpit.transport.csrf_token))
      .pathname;
    const url = prefix + "?" + query;
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

  toString(): string {
    return `Server(${this.host ?? "localhost"})`;
  }
}
