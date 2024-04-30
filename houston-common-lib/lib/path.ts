import { Server } from "@/server";
import {
  Command,
  Process,
  ProcessError,
  CommandOptions,
  BashCommand,
} from "@/process";
import { Result, Ok, Err } from "@thames/monads";
import { User } from "@/user";
import { Group } from "@/group";

export class Path {
  public readonly path: string;

  constructor(path: Path | string) {
    if (path instanceof Path) {
      this.path = path.path;
    } else if (typeof path === "string") {
      this.path = path.replace(/\/+/g, "/").replace(/\/$/, "");
    } else {
      throw TypeError(`typeof path = ${typeof path} != Path|string`);
    }
  }

  isAbsolute(): boolean {
    return this.path[0] === "/";
  }

  isRelative(): boolean {
    return !this.isAbsolute();
  }

  parent(): Path {
    return new Path(this.path.substring(0, this.path.lastIndexOf("/")));
  }

  basename(): string | undefined {
    return this.path.split("/").pop();
  }

  async testOn(
    server: Server,
    testFlag: string,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return (
      await server.execute(
        new Command(["test", testFlag, this.path], commandOptions),
        false
      )
    ).andThen((proc) => Ok(proc.exitStatus === 0));
  }

  async isBlockOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-b", commandOptions);
  }

  async isCharacterOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-c", commandOptions);
  }

  async isDirectoryOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-d", commandOptions);
  }

  async existsOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-e", commandOptions);
  }

  async isFileOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-f", commandOptions);
  }

  async isSymbolicLinkOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-L", commandOptions);
  }

  async isPipeOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-p", commandOptions);
  }

  async isSocketOn(
    server: Server,
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.testOn(server, "-S", commandOptions);
  }

  async createOn(
    server: Server,
    type: "file",
    parents?: boolean,
    commandOptions?: CommandOptions
  ): Promise<Result<File, ProcessError>>;
  async createOn(
    server: Server,
    type: "directory",
    parents?: boolean,
    commandOptions?: CommandOptions
  ): Promise<Result<Directory, ProcessError>>;
  async createOn(
    server: Server,
    type: "file" | "directory",
    parents?: boolean,
    commandOptions?: CommandOptions
  ): Promise<Result<File, ProcessError> | Result<Directory, ProcessError>> {
    if (parents) {
      const makeParentsResult = await server.execute(
        new Command(["mkdir", "-p", this.parent().path], commandOptions)
      );
      if (makeParentsResult.isErr()) {
        return Err(makeParentsResult.unwrapErr());
      }
    }
    if (type === "file") {
      return (
        await server.execute(
          new Command(["touch", this.path], commandOptions),
          true
        )
      ).andThen((_) => Ok(new File(server, this)));
    } /* if (type === "directory") */ else {
      return (
        await server.execute(
          new Command(["mkdir", this.path], commandOptions),
          true
        )
      ).andThen((_) => Ok(new Directory(server, this)));
    }
  }
}

export class ModeOctet {
  r: boolean;
  w: boolean;
  x: boolean;

  constructor(octet: number) {
    this.r = (octet & 0b100) !== 0;
    this.w = (octet & 0b010) !== 0;
    this.x = (octet & 0b001) !== 0;
  }

  toNumber(): number {
    return (this.r ? 0b100 : 0) | (this.w ? 0b010 : 0) | (this.x ? 0b001 : 0);
  }
  toString(): string {
    return `${this.r ? "r" : "-"}${this.w ? "w" : "-"}${this.x ? "x" : "-"}`;
  }
  toOctal(): string {
    return this.toNumber().toString(8);
  }
}

class Mode {
  owner: ModeOctet;
  group: ModeOctet;
  other: ModeOctet;
  constructor(mode: number) {
    this.owner = new ModeOctet((mode >> 6) & 0b111);
    this.group = new ModeOctet((mode >> 3) & 0b111);
    this.other = new ModeOctet((mode >> 0) & 0b111);
  }

  toNumber(): number {
    return (
      (this.owner.toNumber() << 6) |
      (this.group.toNumber() << 3) |
      this.other.toNumber()
    );
  }
  toString(): string {
    return `${this.owner.toString()}${this.group.toString()}${this.other.toString()} (0${this.toOctal()})`;
  }
  toOctal(): string {
    return this.toNumber().toString(8);
  }
}

export class Ownership {
  public user?: User;
  public group?: Group;

  constructor(user: User);
  constructor(group: Group);
  constructor(user: User, group: Group);
  constructor(userOrGroup: User | Group, group?: Group) {
    if (userOrGroup instanceof Group) {
      this.group = userOrGroup;
    } else {
      this.user = userOrGroup;
      this.group = group;
    }
  }

  toChownString(): string {
    return `${this.user?.login ?? ""}:${this.group?.name ?? ""}`;
  }
}

export class FileSystemNode extends Path {
  public readonly server: Server;

  constructor(node: FileSystemNode);
  constructor(server: Server, path: Path | string);
  constructor(serverOrNode: Server | FileSystemNode, path?: Path | string) {
    if (serverOrNode instanceof Server) {
      if (path === undefined) {
        throw TypeError("path undefined!");
      }
      super(path);
      this.server = serverOrNode;
    } else {
      super(serverOrNode.path);
      this.server = serverOrNode.server;
    }
  }

  async isBlock(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.isBlockOn(this.server, commandOptions);
  }

  async isCharacter(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.isCharacterOn(this.server, commandOptions);
  }

  async isDirectory(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.isDirectoryOn(this.server, commandOptions);
  }

  async exists(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.existsOn(this.server, commandOptions);
  }

  async isFile(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.isFileOn(this.server, commandOptions);
  }

  async isSymbolicLink(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.isSymbolicLinkOn(this.server, commandOptions);
  }

  async isPipe(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.isPipeOn(this.server, commandOptions);
  }

  async isSocket(
    commandOptions?: CommandOptions
  ): Promise<Result<boolean, ProcessError>> {
    return this.isSocketOn(this.server, commandOptions);
  }

  async remove(
    commandOptions?: CommandOptions
  ): Promise<Result<null, ProcessError>> {
    return (
      await this.server.execute(
        new Command(["rm", this.path], commandOptions),
        true
      )
    ).andThen(() => Ok(null));
  }

  async chmod(
    mode: Mode,
    commandOptions?: CommandOptions
  ): Promise<Result<null, ProcessError>> {
    return (
      await this.server.execute(
        new Command(["chmod", mode.toOctal(), this.path], commandOptions),
        true
      )
    ).andThen(() => Ok(null));
  }

  async chown(
    ownership: Ownership,
    commandOptions?: CommandOptions
  ): Promise<Result<null, ProcessError>> {
    return (
      await this.server.execute(
        new Command(
          ["chown", ownership.toChownString(), this.path],
          commandOptions
        ),
        true
      )
    ).andThen(() => Ok(null));
  }
}

export class File extends FileSystemNode {
  async create(
    parents?: boolean,
    commandOptions?: CommandOptions
  ): Promise<Result<File, ProcessError>> {
    return this.createOn(this.server, "file", parents, commandOptions);
  }
}

export class Directory extends FileSystemNode {
  async create(
    parents?: boolean,
    commandOptions?: CommandOptions
  ): Promise<Result<Directory, ProcessError>> {
    return this.createOn(this.server, "directory", parents, commandOptions);
  }
}
