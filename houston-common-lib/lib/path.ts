import { Server } from "@/server";
import { BashCommand, Command, CommandOptions } from "@/process";
import { ParsingError, ProcessError } from "@/errors";
import { ResultAsync, okAsync, errAsync, safeTry, ok, err } from "neverthrow";
import { User } from "@/user";
import { Group } from "@/group";
import { FilesystemMount, parseFileSystemType } from "@/filesystem";
import { KeyValueData, KeyValueSyntax, RegexSnippets } from "@/syntax";
import { Maybe, None, Some } from "monet";

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
    return (this.owner.toNumber() << 6) | (this.group.toNumber() << 3) | this.other.toNumber();
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
    return `${this.user ? this.user.login ?? this.user.uid.toString() : ""}:${
      this.group ? this.group.name ?? this.group.gid.toString() : ""
    }`;
  }
}

export type ExtendedAttributes = KeyValueData;

export class Path {
  public readonly path: string;

  constructor(path: Path | string) {
    if (path instanceof Path) {
      this.path = path.path;
    } else if (typeof path === "string") {
      // remove repeated separators
      this.path = path.replace(/\/+/g, "/");
      if (this.path.length > 1) {
        // remove possible trailing separator
        this.path = this.path.replace(/\/$/, "");
      }
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
    const lastSeparatorIndex = this.path.lastIndexOf("/");
    if (lastSeparatorIndex === -1) {
      return new Path(this.path + "/..");
    }
    if (lastSeparatorIndex === 0) {
      // root of absolute path
      return new Path("/");
    }
    return new Path(this.path.substring(0, lastSeparatorIndex));
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
      .execute(new Command(["test", testFlag, this.path], commandOptions), false)
      .map((proc) => proc.exitStatus === 0);
  }

  isBlockOn(server: Server, commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
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

  existsOn(server: Server, commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-e", commandOptions);
  }

  isFileOn(server: Server, commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-f", commandOptions);
  }

  isSymbolicLinkOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-L", commandOptions);
  }

  isPipeOn(server: Server, commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.testOn(server, "-p", commandOptions);
  }

  isSocketOn(server: Server, commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
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
    const createResult = (
      parents
        ? server
            .execute(new Command(["mkdir", "-p", this.parent().path], commandOptions))
            .map(() => null)
        : okAsync(null)
    )
      .map(() => new Command([type === "file" ? "touch" : "mkdir", this.path], commandOptions))
      .andThen((cmd) => server.execute(cmd, true));
    return type === "file"
      ? createResult.map(() => new File(server, this))
      : createResult.map(() => new Directory(server, this));
  }

  getFilesystemMountOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<FilesystemMount, ProcessError> {
    return server
      .execute(new Command(["df", "--output=source,target,fstype", this.path], commandOptions))
      .map((proc) => proc.getStdout().trim().split(RegexSnippets.newlineSplitter)[1])
      .andThen((tokens) => {
        const [source, mountpoint, realType] = tokens?.split(/\s+/g) ?? [];
        if (source === undefined || mountpoint === undefined || realType === undefined) {
          return errAsync(new ParsingError(`Failed to parse filesystem mount:\n${tokens}`));
        }
        return okAsync({
          filesystem: {
            source,
            type: parseFileSystemType(realType),
            realType,
          },
          mountpoint,
        });
      });
  }

  resolveOn(
    server: Server,
    mustExist: boolean = false,
    commandOptions?: CommandOptions
  ): ResultAsync<Path, ProcessError> {
    return server
      .execute(
        new Command(
          ["realpath", mustExist ? "--canonicalize-existing" : "--canonicalize-missing", this.path],
          commandOptions
        )
      )
      .map((proc) => new Path(proc.getStdout().trim()));
  }

  findLongestExistingStemOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<Path, ProcessError> {
    if (!this.isAbsolute()) {
      return errAsync(
        new ProcessError(`Path.findLongestExistingStemOn: Path not absolute: ${this.path}`)
      );
    }
    let path: Path = this;
    return new ResultAsync(
      safeTry<Path, ProcessError>(async function* () {
        while (path.path !== "/") {
          if (yield* path.existsOn(server, commandOptions).safeUnwrap()) {
            return ok(path);
          }
          path = path.parent();
        }
        return ok(path);
      })
    );
  }

  getModeOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<Mode, ProcessError | ParsingError> {
    return server
      .execute(new Command(["stat", "--printf", "%#a", "--", this.path], commandOptions))
      .map((proc) => parseInt(proc.getStdout().trim(), 8))
      .andThen((mode) => (isNaN(mode) ? err(new ParsingError("Failed to parse mode")) : ok(mode)))
      .map((mode) => new Mode(mode));
  }

  setModeOn(
    server: Server,
    mode: Mode | number,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    mode = typeof mode === "number" ? new Mode(mode) : mode;
    return server
      .execute(new Command(["chmod", "--", mode.toOctal(), this.path], commandOptions))
      .map(() => this);
  }

  getOwnershipOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<Ownership, ProcessError | ParsingError> {
    return server
      .execute(new Command(["stat", "--printf", "%u:%g", "--", this.path], commandOptions))
      .andThen((proc) => {
        const ownershipString = proc.getStdout().trim();
        const [uid, gid] = ownershipString.split(":").map((s) => parseInt(s));
        if (uid === undefined || gid === undefined || isNaN(uid) || isNaN(gid)) {
          return err(new ParsingError(`Failed to parse ownership from ${ownershipString}`));
        }
        return ResultAsync.combine([server.getUserByUid(uid), server.getGroupByGid(gid)]).map(
          ([user, group]) => new Ownership(user, group)
        );
      });
  }

  setOwnershipOn(
    server: Server,
    ownership: Ownership,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return server
      .execute(new Command(["chown", "--", ownership.toChownString(), this.path], commandOptions))
      .map(() => this);
  }

  getExtendedAttributesOn(
    server: Server,
    commandOptions?: CommandOptions
  ): ResultAsync<ExtendedAttributes, ProcessError> {
    const kvParser = KeyValueSyntax({ duplicateKey: "error" });
    return server
      .execute(new Command(["getfattr", "--dump", "--match=-", "--", this.path], commandOptions))
      .map((proc) => proc.getStdout())
      .andThen(kvParser.apply);
  }

  setExtendedAttributesOn(
    server: Server,
    attributes: ExtendedAttributes,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return ResultAsync.combine(
      Object.entries(attributes).map(([key, value]) =>
        this.setExtendedAttributeOn(server, key, value, commandOptions)
      )
    ).map(() => this);
  }

  getExtendedAttributeOn(
    server: Server,
    attributeName: string,
    commandOptions?: CommandOptions
  ): ResultAsync<Maybe<string>, ProcessError> {
    return server
      .execute(
        new Command(
          [
            "getfattr",
            `--name=${attributeName}`,
            "--only-values",
            "--absolute-names",
            "--",
            this.path,
          ],
          commandOptions
        ),
        false
      )
      .andThen((proc) =>
        proc.exitStatus === 0
          ? ok(Some(proc.getStdout().trim()))
          : proc.getStderr().trim().endsWith("No such attribute")
            ? ok(None<string>())
            : err(new ProcessError(proc.getStderr().trim()))
      );
  }

  setExtendedAttributeOn(
    server: Server,
    attributeName: string,
    attributeValue: string,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return server
      .execute(
        new Command(
          ["setfattr", `--name=${attributeName}`, `--value=${attributeValue}`, "--", this.path],
          commandOptions
        )
      )
      .map(() => this);
  }

  removeExtendedAttributeOn(
    server: Server,
    attributeName: string,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return server
      .execute(
        new Command(["setfattr", `--remove=${attributeName}`, "--", this.path], commandOptions)
      )
      .map(() => this);
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

  parent(): FileSystemNode {
    return new FileSystemNode(this.server, super.parent());
  }

  isBlock(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isBlockOn(this.server, commandOptions);
  }

  isCharacter(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isCharacterOn(this.server, commandOptions);
  }

  isDirectory(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isDirectoryOn(this.server, commandOptions);
  }

  exists(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.existsOn(this.server, commandOptions);
  }

  isFile(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isFileOn(this.server, commandOptions);
  }

  isSymbolicLink(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isSymbolicLinkOn(this.server, commandOptions);
  }

  isPipe(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isPipeOn(this.server, commandOptions);
  }

  isSocket(commandOptions?: CommandOptions): ResultAsync<boolean, ProcessError> {
    return this.isSocketOn(this.server, commandOptions);
  }

  getFilesystemMount(commandOptions?: CommandOptions): ResultAsync<FilesystemMount, ProcessError> {
    return this.getFilesystemMountOn(this.server, commandOptions);
  }

  resolve(
    mustExist: boolean = false,
    commandOptions?: CommandOptions
  ): ResultAsync<FileSystemNode, ProcessError> {
    return this.resolveOn(this.server, mustExist, commandOptions).map(
      (path) => new FileSystemNode(this.server, path)
    );
  }

  findLongestExistingStem(
    commandOptions?: CommandOptions
  ): ResultAsync<FileSystemNode, ProcessError> {
    return this.findLongestExistingStemOn(this.server, commandOptions).map(
      (path) => new FileSystemNode(this.server, path)
    );
  }

  getMode(commandOptions?: CommandOptions): ResultAsync<Mode, ProcessError | ParsingError> {
    return this.getModeOn(this.server, commandOptions);
  }

  setMode(mode: Mode | number, commandOptions?: CommandOptions): ResultAsync<this, ProcessError>;
  setMode(
    reference: FileSystemNode,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError>;
  setMode(
    mode: Mode | number | FileSystemNode,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return (
      mode instanceof FileSystemNode
        ? mode.getMode(commandOptions)
        : okAsync<Mode | number, ProcessError>(mode)
    ).andThen((mode) => this.setModeOn(this.server, mode, commandOptions));
  }

  getOwnership(
    commandOptions?: CommandOptions | undefined
  ): ResultAsync<Ownership, ProcessError | ParsingError> {
    return this.getOwnershipOn(this.server, commandOptions);
  }

  setOwnership(
    ownership: Ownership,
    commandOptions?: CommandOptions | undefined
  ): ResultAsync<this, ProcessError>;
  setOwnership(
    reference: FileSystemNode,
    commandOptions?: CommandOptions | undefined
  ): ResultAsync<this, ProcessError>;
  setOwnership(
    ownership: Ownership | FileSystemNode,
    commandOptions?: CommandOptions | undefined
  ): ResultAsync<this, ProcessError> {
    return (
      ownership instanceof FileSystemNode
        ? ownership.getOwnership(commandOptions)
        : okAsync(ownership)
    ).andThen((ownership) => this.setOwnershipOn(this.server, ownership, commandOptions));
  }

  assertExists(
    expected: boolean = true,
    commandOptions?: CommandOptions | undefined
  ): ResultAsync<this, ProcessError> {
    return this.exists(commandOptions).andThen((exists) =>
      exists === expected
        ? ok(this)
        : err(new ProcessError(`assertExists(${expected}) failed: ${this.path}`))
    );
  }

  assertIsFile(commandOptions?: CommandOptions | undefined): ResultAsync<File, ProcessError> {
    return this.isFile(commandOptions).andThen((isFile) =>
      isFile ? ok(new File(this)) : err(new ProcessError(`assertIsFile failed: ${this.path}`))
    );
  }

  assertIsDirectory(
    commandOptions?: CommandOptions | undefined
  ): ResultAsync<Directory, ProcessError> {
    return this.isDirectory(commandOptions).andThen((isDirectory) =>
      isDirectory
        ? ok(new Directory(this))
        : err(new ProcessError(`assertIsDirectory failed: ${this.path}`))
    );
  }

  getExtendedAttributes(
    commandOptions?: CommandOptions
  ): ResultAsync<ExtendedAttributes, ProcessError> {
    return this.getExtendedAttributesOn(this.server, commandOptions);
  }

  setExtendedAttributes(
    attributes: ExtendedAttributes,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return this.setExtendedAttributesOn(this.server, attributes, commandOptions);
  }

  getExtendedAttribute(
    attributeName: string,
    commandOptions?: CommandOptions
  ): ResultAsync<Maybe<string>, ProcessError> {
    return this.getExtendedAttributeOn(this.server, attributeName, commandOptions);
  }

  setExtendedAttribute(
    attributeName: string,
    attributeValue: string,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return this.setExtendedAttributeOn(this.server, attributeName, attributeValue, commandOptions);
  }

  removeExtendedAttribute(
    attributeName: string,
    commandOptions?: CommandOptions
  ): ResultAsync<this, ProcessError> {
    return this.removeExtendedAttributeOn(this.server, attributeName, commandOptions);
  }

  move(
    newPath: string,
    commandOptions: CommandOptions & {
      existing?: "fail" | "clobber" | "backup";
    } = {}
  ): ResultAsync<FileSystemNode, ProcessError> {
    const { existing, ...options }: typeof commandOptions = {
      existing: "fail",
      ...commandOptions,
    };
    const existingFlagsLUT: Record<typeof existing, string[]> = {
      fail: ["--no-clobber"],
      clobber: ["--force"],
      backup: ["--backup=numbered"],
    };
    return this.server
      .execute(
        new Command(
          ["mv", ...existingFlagsLUT[existing], "--no-target-directory", "--", this.path, newPath],
          options
        )
      )
      .map(() => new FileSystemNode(this.server, newPath));
  }
}

export class File extends FileSystemNode {
  create(parents?: boolean, commandOptions?: CommandOptions): ResultAsync<File, ProcessError> {
    return this.createOn(this.server, "file", parents, commandOptions);
  }

  remove(commandOptions?: CommandOptions): ResultAsync<this, ProcessError> {
    return this.server
      .execute(new Command(["rm", this.path], commandOptions), true)
      .map(() => this);
  }

  read(commandOptions?: CommandOptions & { binary?: false }): ResultAsync<string, ProcessError>;
  read(commandOptions: CommandOptions & { binary: true }): ResultAsync<Uint8Array, ProcessError>;
  read(
    commandOptions: CommandOptions & { binary?: boolean } = {}
  ): ResultAsync<string, ProcessError> | ResultAsync<Uint8Array, ProcessError> {
    const { binary, ...options } = commandOptions;
    const procResult = this.server.execute(new Command(["cat", this.path], options));
    if (binary) {
      return procResult.map((p) => p.getStdout(true));
    }
    return procResult.map((p) => p.getStdout(false));
  }

  write(
    content: string | Uint8Array,
    commandOptions: CommandOptions & { append?: boolean } = {}
  ): ResultAsync<this, ProcessError> {
    const { append, ...options } = commandOptions;
    const proc = this.server.spawnProcess(
      new Command(
        [
          "dd",
          "status=none",
          `of=${this.path}`,
          ...(append ? ["oflag=append", "conv=notrunc"] : []),
        ],
        options
      )
    );
    proc.write(content, false);
    return proc.wait(true).map(() => this);
  }

  move(...args: Parameters<FileSystemNode["move"]>): ResultAsync<File, ProcessError> {
    return super.move(...args).map((node) => new File(node));
  }

  replace(
    newContent: string | Uint8Array,
    commandOptions?: CommandOptions & { backup?: boolean }
  ): ResultAsync<this, ProcessError>;
  replace(
    replacer: (oldContent: string) => string,
    commandOptions?: CommandOptions & { binary?: false; backup?: boolean }
  ): ResultAsync<this, ProcessError>;
  replace(
    replacer: (oldContent: Uint8Array) => Uint8Array,
    commandOptions: CommandOptions & { binary: true; backup?: boolean }
  ): ResultAsync<this, ProcessError>;
  replace(
    newContentOrReplacer:
      | string
      | Uint8Array
      | ((oldContent: string) => string)
      | ((oldContent: Uint8Array) => Uint8Array),
    commandOptions: CommandOptions & { binary?: boolean; backup?: boolean } = {}
  ): ResultAsync<this, ProcessError> {
    const { binary, backup, ...options } = commandOptions;
    return File.makeTemp(this.server, this.parent().path, options)
      .andThen((tempFile) => {
        if (typeof newContentOrReplacer === "function") {
          if (binary) {
            return this.read({ ...options, binary: true })
              .map(newContentOrReplacer as (oldContent: Uint8Array) => Uint8Array)
              .andThen((newContent) => tempFile.write(newContent, options));
          }
          return this.read({ ...options, binary: false })
            .map(newContentOrReplacer as (oldContent: string) => string)
            .andThen((newContent) => tempFile.write(newContent, options));
        }
        return okAsync(newContentOrReplacer).andThen((newContent) =>
          tempFile.write(newContent, options)
        );
      })
      .andThen((tempFile) => tempFile.setOwnership(this, options))
      .andThen((tempFile) => tempFile.setMode(this, options))
      .andThen((tempFile) =>
        tempFile.move(this.path, {
          ...options,
          existing: backup ? "backup" : "clobber",
        })
      )
      .map(() => this);
  }

  static makeTemp(
    server: Server,
    directory?: string,
    commandOptions?: CommandOptions
  ): ResultAsync<File, ProcessError> {
    return server
      .execute(
        new Command(
          ["mktemp", ...(directory === undefined ? [] : [`--tmpdir=${directory}`])],
          commandOptions
        )
      )
      .map((proc) => new File(server, proc.getStdout().trim()));
  }
}

export class Directory extends FileSystemNode {
  create(parents?: boolean, commandOptions?: CommandOptions): ResultAsync<Directory, ProcessError> {
    return this.createOn(this.server, "directory", parents, commandOptions);
  }

  remove(commandOptions?: CommandOptions): ResultAsync<this, ProcessError> {
    return this.server
      .execute(new Command(["rmdir", this.path], commandOptions), true)
      .map(() => this);
  }

  getChildren(
    opts: {
      /**
       * Glob expression. Default: "*"
       */
      nameFilter?: string;
      /**
       * Glob expression. Default: "*"
       */
      pathFilter?: string;
      /**
       * Limit number of returned entries. "none" for no limit.
       * Default: 50
       */
      limit?: number | "none";
    },
    commandOptions?: CommandOptions
  ): ResultAsync<FileSystemNode[], ProcessError> {
    opts.limit ??= 50;
    return this.server
      .execute(
        new BashCommand(
          'find -H "$1" -mindepth 1 -maxdepth 1 -name "$2" -path "$3" -print0' +
            (opts.limit === "none" ? "" : ` | head -z -n ${opts.limit.toString()}`),
          [this.path, opts.nameFilter ?? "*", opts.pathFilter ?? "*"],
          commandOptions
        )
      )
      .map((proc) =>
        proc
          .getStdout()
          .trim()
          .split("\0")
          .slice(0, -1)
          .map((pathString) => new FileSystemNode(this.server, pathString))
      );
  }

  move(...args: Parameters<FileSystemNode["move"]>): ResultAsync<Directory, ProcessError> {
    return super.move(...args).map((node) => new Directory(node));
  }
}
