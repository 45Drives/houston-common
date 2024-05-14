import { Server } from "@/server";
import { Command, CommandOptions } from "@/process";
import { ProcessError } from "@/errors";
import { ResultAsync, okAsync } from "neverthrow";
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

  testOn(
    server: Server,
    testFlag: string,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return server
      .execute(
        new Command(["test", testFlag, this.path], commandOptions),
        false
      )
      .map((proc) => proc.exitStatus === 0);
  }

  isBlockOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-b", commandOptions);
  }

  isCharacterOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-c", commandOptions);
  }

  isDirectoryOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-d", commandOptions);
  }

  existsOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-e", commandOptions);
  }

  isFileOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-f", commandOptions);
  }

  isSymbolicLinkOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-L", commandOptions);
  }

  isPipeOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-p", commandOptions);
  }

  isSocketOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-S", commandOptions);
  }

  createOn(
    server: Server,
    type: "file",
    parents?: boolean,
    commandOptions?: CommandOptions
  ): ResultAsync<File, ProcessError>;
  createOn(
    server: Server,
    type: "directory",
    parents?: boolean,
    commandOptions?: CommandOptions
  ): ResultAsync<Directory, ProcessError>;
  createOn(
    server: Server,
    type: "file" | "directory",
    parents?: boolean,
    commandOptions?: CommandOptions
  ): ResultAsync<File, ProcessError> | ResultAsync<Directory, ProcessError> {
    return (
      parents
        ? server
            .execute(
              new Command(["mkdir", "-p", this.parent().path], commandOptions)
            )
            .map(() => null)
        : okAsync(null)
    )
      .map(
        () =>
          new Command(
            [type === "file" ? "touch" : "mkdir", this.path],
            commandOptions
          )
      )
      .andThen((cmd) => server.execute(cmd, true))
      .map(() =>
        type === "file" ? new File(server, this) : new Directory(server, this)
      );
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

export class Mode {
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
    if ("uid" in userOrGroup) {
      this.user = userOrGroup;
      this.group = group;
    } else {
      this.group = userOrGroup;
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

  isBlock(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isBlockOn(this.server, commandOptions);
  }

  isCharacter(
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.isCharacterOn(this.server, commandOptions);
  }

  isDirectory(
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.isDirectoryOn(this.server, commandOptions);
  }

  exists(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.existsOn(this.server, commandOptions);
  }

  isFile(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isFileOn(this.server, commandOptions);
  }

  isSymbolicLink(
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.isSymbolicLinkOn(this.server, commandOptions);
  }

  isPipe(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isPipeOn(this.server, commandOptions);
  }

  isSocket(
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.isSocketOn(this.server, commandOptions);
  }

  remove(commandOptions?: CommandOptions): ResultAsync<null, ProcessError> {
    return this.server
      .execute(new Command(["rm", this.path], commandOptions), true)
      .map(() => null);
  }

  chmod(
    mode: Mode,
    commandOptions?: CommandOptions
  ): ResultAsync<null, ProcessError> {
    return this.server
      .execute(
        new Command(["chmod", mode.toOctal(), this.path], commandOptions),
        true
      )
      .map(() => null);
  }

  chown(
    ownership: Ownership,
    commandOptions?: CommandOptions
  ): ResultAsync<null, ProcessError> {
    return this.server
      .execute(
        new Command(
          ["chown", ownership.toChownString(), this.path],
          commandOptions
        ),
        true
      )
      .map(() => null);
  }
}

export class File extends FileSystemNode {
  create(
    parents?: boolean,
    commandOptions?: CommandOptions
  ): ResultAsync<File, ProcessError> {
    return this.createOn(this.server, "file", parents, commandOptions);
  }
}

export class Directory extends FileSystemNode {
  create(
    parents?: boolean,
    commandOptions?: CommandOptions
  ): ResultAsync<Directory, ProcessError> {
    return this.createOn(this.server, "directory", parents, commandOptions);
  }
}
