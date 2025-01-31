import { ResultAsync, ok, okAsync, err, errAsync } from "neverthrow";
import { Command, Process, ExitedProcess } from "@/process";
import { User, LocalUser, isLocalUser } from "@/user";
import { Group, LocalGroup, isLocalGroup } from "@/group";
import { Directory, File } from "@/path";
import { ParsingError, ProcessError, ValueError } from "@/errors";
import { Download } from "@/download";
import { safeJsonParse } from "./utils";

export type ServerInfo = {
  Motherboard: {
    Manufacturer: string,
    ["Product Name"]: string,
    ["Serial Number"]: string
  },
  HBA:
  ({
    Model: string,
    Adapter: string,
    "Bus Address": string,
    "Drive Connections": number,
    "Kernel Driver": string,
    "PCI Slot": number
  })[],
  Hybrid: boolean,
  Serial: string,
  Model: string,
  "Alias Style": string,
  "Chassis Size": string,
  VM: boolean,
  "Edit Mode": boolean,
  "OS NAME": string,
  "OS VERSION_ID": string
}

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

  getServerInfo(): ResultAsync<Partial<ServerInfo>, ProcessError | SyntaxError> {
    return new File(
      this,
      "/etc/45drives/server_info/server_info.json"
    ).read()
      .andThen(safeJsonParse<ServerInfo>);
  }

  async getSystemImgPath(): Promise<string> {
    const serverInfo = await this.getServerInfo().unwrapOr(null);
    const model = serverInfo?.Model ?? ""
    
    if (model == "" || model == "?") {
      return "img/45dlogo.png";
    }

    const regExpModel =
      /(Storinator|Stornado|HomeLab|Professional|Proxinator).*(HL15|HL4|HL8|PRO4|PRO8|PRO15|AV15|Q30|S45|XL60|2U|C8|MI4|F8X1|F8X2|F8X3|F2|VM8|VM16|VM32).*/;
    const match = model.match(regExpModel);
    const imgPathLookup: any = {
      "Storinator": {
        "AV15": "img/storinatorAV15.png",
        "Q30": "img/storinatorQ30.png",
        "S45": "img/storinatorS45.png",
        "XL60": "img/storinatorXL60.png",
        "C8": "img/storinatorC8.png",
        "MI4": "img/storinatorMI4.png",
        "F8X1": "img/F8X1.png",
        "F8X2": "img/F8X2.png",
        "F8X3": "img/F8X3.png"
      },
      "Stornado": {
        "2U": "img/stornado2U.png",
        "AV15": "img/stornadoAV15.png",
        "F2": "img/stornadoF2.png"
      },
      "HomeLab": {
        "HL15": "img/homelabHL15.png",
        "HL4": "img/homelabHL4.png",
        "HL8": "img/homelabHL8.png",
      },
      "Professional": {
        "PRO15": "img/professionalPRO15.png",
        "PRO4": "img/professionalPRO4.png",
        "PRO8": "img/professionalPRO8.png",
      },
      "Proxinator":{
        "VM8": "img/proxinator.png",
        "VM16": "img/proxinator.png",
        "VM32": "img/proxinator.png",
      }
    };

    if(!match) return "img/45dlogo.png";
    const m1 = match[1];
    const m2 = match[2];
    if (!m1 || !m2) return "img/45dlogo.png";
    
    return imgPathLookup[m1][m2];
  }

  getHostname(cache: boolean = true): ResultAsync<string, ProcessError> {
    if (this.hostname === undefined || cache === false) {
      return this.execute(new Command(["hostname"]), true).map(
        (proc) => (this.hostname = proc.getStdout().trim())
      );
    }
    return okAsync(this.hostname);
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
