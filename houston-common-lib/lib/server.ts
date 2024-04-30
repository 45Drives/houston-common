import { Result, Ok, Err } from "@thames/monads";
import { Command, Process, ExitedProcess, ProcessError } from "@/process";
import { User } from "@/user";
import { Group } from "@/group";
import { Directory, File } from "@/path";

export class Server {
  public readonly host?: string;
  private hostname?: string;
  private ipAddress?: string;
  private localUsers?: User[];
  private localGroups?: Group[];

  constructor(host?: string) {
    this.host = host;
  }

  async isAccessible(): Promise<Result<true, ProcessError>> {
    return (await this.execute(new Command(["true"]), true)).andThen(() =>
      Ok(true)
    );
  }

  async getHostname(
    cache: boolean = true
  ): Promise<Result<string, ProcessError>> {
    if (this.hostname === undefined || cache === false) {
      return (await this.execute(new Command(["hostname"]), true)).map(
        (proc) => (this.hostname = proc.getStdout().trim())
      );
    }
    return Ok(this.hostname);
  }

  async getIpAddress(cache: boolean = true): Promise<Result<string, Error>> {
    if (this.ipAddress === undefined || cache === false) {
      const target = "1.1.1.1";
      return (
        await this.execute(new Command(["ip", "route", "get", target]), true)
      ).andThen((proc) => {
        const match = proc.getStdout().match(/src (ipAddress:[^\t ]+) /);
        if (match === null || match.groups === undefined) {
          const e = Error(`Malformed output from ${proc}`);
          console.log(e);
          console.log(proc.getStdout());
          return Err(e);
        }
        this.ipAddress = match.groups["ipAddress"] as string;
        return Ok(this.ipAddress);
      });
    }
    return Ok(this.ipAddress);
  }

  spawnProcess(command: Command, defer: boolean = false): Process {
    return new Process(this, command, defer);
  }

  execute(
    command: Command,
    failIfNonZero: boolean = true
  ): Promise<Result<ExitedProcess, ProcessError>> {
    return this.spawnProcess(command).wait(failIfNonZero);
  }

  async getLocalUsers(
    cache: boolean = true
  ): Promise<Result<User[], ProcessError>> {
    if (this.localUsers === undefined || cache === false) {
      return (
        await this.execute(new Command(["cat", "/etc/passwd"]), true)
      ).map((proc) => {
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
      });
    }
    return Ok(this.localUsers);
  }

  async getLocalGroups(
    cache: boolean = true
  ): Promise<Result<Group[], ProcessError>> {
    if (this.localGroups === undefined || cache === false) {
      return (await this.execute(new Command(["cat", "/etc/group"]), true)).map(
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
    return Ok(this.localGroups);
  }

  async getUserGroups(user: User): Promise<Result<Group[], ProcessError>> {
    const userGroupNamesResult = (
      await this.execute(new Command(["groups", user.login]), true)
    ).map((proc) =>
      proc
        .getStdout()
        /* remove "user : " present in some distros */
        .replace(/^[^:]+:/, "")
        .trim()
        .split(" ")
    );
    if (userGroupNamesResult.isErr()) {
      return Err(userGroupNamesResult.unwrapErr());
    }
    const userGroupNames = await userGroupNamesResult.unwrap();
    return (await this.getLocalGroups()).map((localGroups) =>
      localGroups.filter((group) => group.name in userGroupNames)
    );
  }

  async getGroupMembers(group: Group): Promise<Result<User[], ProcessError>> {
    return (await this.getLocalUsers()).map((localUsers) =>
      localUsers.filter((user) => user.login in group.members)
    );
  }

  async getUserByLogin(
    login: string
  ): Promise<Result<User | null, ProcessError>> {
    return (await this.getLocalUsers()).map(
      (localUsers) =>
        localUsers.filter((user) => user.login === login)[0] ?? null
    );
  }

  async getUserByUid(uid: number): Promise<Result<User | null, ProcessError>> {
    return (await this.getLocalUsers()).map(
      (localUsers) => localUsers.filter((user) => user.uid === uid)[0] ?? null
    );
  }

  async getGroupByName(
    groupName: string
  ): Promise<Result<Group | null, ProcessError>> {
    return (await this.getLocalGroups()).map(
      (localGroups) =>
        localGroups.filter((group) => group.name === groupName)[0] ?? null
    );
  }

  async getGroupByGid(
    gid: number
  ): Promise<Result<Group | null, ProcessError>> {
    return (await this.getLocalGroups()).map(
      (localGroups) =>
        localGroups.filter((group) => group.gid === gid)[0] ?? null
    );
  }

  toString(): string {
    return `Server(${this.host ?? "localhost"})`;
  }
}
