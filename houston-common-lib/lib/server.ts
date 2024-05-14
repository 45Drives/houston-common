import { ResultAsync, ok, okAsync, err } from "neverthrow";
import { Command, Process, ExitedProcess } from "@/process";
import { User } from "@/user";
import { Group } from "@/group";
import { Directory, File } from "@/path";
import { ParsingError, ProcessError } from "@/errors";

export class Server {
  public readonly host?: string;
  private hostname?: string;
  private ipAddress?: string;
  private localUsers?: User[];
  private localGroups?: Group[];

  constructor(host?: string) {
    this.host = host;
  }

  isAccessible(): ResultAsync<true, ProcessError> {
    return this.execute(new Command(["true"]), true).map(() => true);
  }

  getHostname(cache: boolean = true): ResultAsync<string, ProcessError> {
    if (this.hostname === undefined || cache === false) {
      return this.execute(new Command(["hostname"]), true).map(
        (proc) => (this.hostname = proc.getStdout().trim())
      );
    }
    return okAsync(this.hostname);
  }

  getIpAddress(
    cache: boolean = true
  ): ResultAsync<string, ProcessError | ParsingError> {
    if (this.ipAddress === undefined || cache === false) {
      const target = "1.1.1.1";
      return this.execute(
        new Command(["ip", "route", "get", target]),
        true
      ).andThen((proc) => {
        const stdout = proc.getStdout();
        const match = stdout.match(
          /\bsrc\s+(?<ipAddress>\d{1,3}(?:\.\d{1,3}){3})\b/
        );
        if (match === null || match.groups === undefined) {
          return err(
            new ParsingError(`Malformed output from ${proc}`, { cause: stdout })
          );
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

  getLocalUsers(cache: boolean = true): ResultAsync<User[], ProcessError> {
    if (this.localUsers === undefined || cache === false) {
      return this.execute(new Command(["cat", "/etc/passwd"]), true).map(
        (proc) => {
          this.localUsers = proc
            .getStdout()
            .split("\n")
            .map((line) => {
              const [login, _, uidStr, gidStr, name, home, shell] =
                line.split(":");
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
            .filter((user): user is User => user !== null);
          return this.localUsers;
        }
      );
    }
    return okAsync(this.localUsers);
  }

  getLocalGroups(cache: boolean = true): ResultAsync<Group[], ProcessError> {
    if (this.localGroups === undefined || cache === false) {
      return this.execute(new Command(["cat", "/etc/group"]), true).map(
        (proc) => {
          this.localGroups = proc
            .getStdout()
            .split("\n")
            .map((line) => {
              const [name, _, gidStr, membersStr] = line.split(":");
              if (
                name === undefined ||
                gidStr === undefined ||
                membersStr === undefined
              ) {
                return null;
              }
              const gid = parseInt(gidStr);
              if (isNaN(gid)) {
                return null;
              }
              return Group(this, name, gid, membersStr.split(","));
            })
            .filter((group): group is Group => group instanceof Group);
          return this.localGroups;
        }
      );
    }
    return okAsync(this.localGroups);
  }

  getUserGroups(user: User): ResultAsync<Group[], ProcessError> {
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

  getGroupMembers(group: Group): ResultAsync<User[], ProcessError> {
    return this.getLocalUsers().map((localUsers) =>
      localUsers.filter((user) => user.login in group.members)
    );
  }

  getUserByLogin(login: string): ResultAsync<User | null, ProcessError> {
    return this.getLocalUsers().map(
      (localUsers) =>
        localUsers.filter((user) => user.login === login)[0] ?? null
    );
  }

  getUserByUid(uid: number): ResultAsync<User | null, ProcessError> {
    return this.getLocalUsers().map(
      (localUsers) => localUsers.filter((user) => user.uid === uid)[0] ?? null
    );
  }

  getGroupByName(groupName: string): ResultAsync<Group | null, ProcessError> {
    return this.getLocalGroups().map(
      (localGroups) =>
        localGroups.filter((group) => group.name === groupName)[0] ?? null
    );
  }

  getGroupByGid(gid: number): ResultAsync<Group | null, ProcessError> {
    return this.getLocalGroups().map(
      (localGroups) =>
        localGroups.filter((group) => group.gid === gid)[0] ?? null
    );
  }

  toString(): string {
    return `Server(${this.host ?? "localhost"})`;
  }
}
