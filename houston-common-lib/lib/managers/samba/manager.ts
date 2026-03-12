import { Result, ResultAsync, err, ok, okAsync } from "neverthrow";

import { SambaConfig, SambaGlobalConfig, SambaShareConfig } from "@/managers/samba/types";
import { ParsingError, ProcessError } from "@/errors";
import { CommandOptions, Command } from "@/process";
import { Server } from "@/server";
import { IniSyntax, KeyValueData, RegexSnippets, StringUtils } from "@/syntax";
import { SambaConfParser, SambaShareParser, SambaGlobalParser } from "@/managers/samba/parser";
import { keyValueDiff } from "@/utils";
import { File } from "@/path";

import recommendedDefaultsConf from "./recommended-defaults.conf?raw";

import { server as defaultServer } from "@/houston";

export interface ISambaManager {
  /**
   * Parse configuration text into a share object
   * @param shareConfig Share configuration text, including '[share name]' header
   */
  parseShareConfig(shareConfig: string): Result<SambaShareConfig, ParsingError>;

  /**
   * Parse global configuration text into global config object
   * @param globalConfig Global configuration text, including '[global]' header
   */
  parseGlobalConfig(globalConfig: string): Result<SambaGlobalConfig, ParsingError>;

  /**
   * Parse complete samba configuration text (e.g. contents of smb.conf) into configuration object
   * @param config Complete configuration text
   */
  parseConfig(config: string): Result<SambaConfig, ParsingError>;

  /**
   * Unparse comlete samba configuration object back into smbd.conf format text
   * @param config
   */
  unparseConfig(config: SambaConfig): Result<string, ParsingError>;

  /**
   * Get current global configuration
   */
  getGlobalConfig(): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError>;

  /**
   * Update current global configuration
   * @param globalConfig New global configuration
   */
  editGlobal(
    globalConfig: SambaGlobalConfig
  ): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError>;

  /**
   * Get list of all share names
   */
  listShareNames(): ResultAsync<string[], ParsingError | ProcessError>;

  /**
   * Get share configuration by name
   * @param shareName
   */
  getShare(shareName: string): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  /**
   * Get all share configurations
   */
  getShares(): ResultAsync<SambaShareConfig[], ParsingError | ProcessError>;

  /**
   * Add a new share configuration
   * @param share share configuration to add
   */
  addShare(share: SambaShareConfig): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  /**
   * Update an existing share configuration
   * NOTE: cannot simply update share name. see {@link renameShare()}
   * @param share new share configuration
   */
  editShare(share: SambaShareConfig): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  /**
   * Remove an existing share configuration
   * @param share share to remove
   */
  removeShare(share: SambaShareConfig): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  /**
   * Dump configuration to smb.conf format as string
   */
  exportConfig(): ResultAsync<string, ProcessError>;

  /**
   * Import configuration from smb.conf format string
   * @param config smb.conf format string
   */
  importConfig(config: string): ResultAsync<this, ProcessError>;

  /**
   * Recommended defaults for a new share. Maintained in {@link ./recommended-defaults.conf}
   */
  recommendedShareDefaults(): Result<SambaShareConfig, ParsingError>;

  /**
   * Recommended defaults for global configuration. Maintained in {@link ./recommended-defaults.conf}
   */
  recommendedGlobalDefaults(): Result<SambaGlobalConfig, ParsingError>;

  /**
   * Rename a share
   * @param oldName
   * @param newName
   */
  renameShare(
    oldName: string,
    newName: string
  ): ResultAsync<SambaShareConfig, ProcessError | ParsingError>;

  /**
   * Add samba user with specific passwd
   * @param user
   * @param passwd
   */
  setUserPassword(user: string, passwd: string): ResultAsync<void, ProcessError>;

  /**
   * Remove user's smbpasswd
   * @param user
   */
  removeUserPassword(user: string): ResultAsync<void, ProcessError>;

  /**
   * Check if user has smbpasswd set
   * @param user
   */
  userHasPassword(user: string): ResultAsync<boolean, ProcessError>;

  /**
   * Kick clients from share
   * @param sharename
   */
  closeSambaShare(sharename: string): ResultAsync<void, ProcessError>;

  getServer(): Server;
}

export abstract class SambaManagerBase implements ISambaManager {
  constructor(protected server: Server) {}
  parseShareConfig(shareConfig: string): Result<SambaShareConfig, ParsingError> {
    return IniSyntax()
      .apply(shareConfig)
      .andThen((shareIniData) => {
        const objKeys = Object.keys(shareIniData);
        const [shareName] = objKeys;
        if (shareName === undefined) {
          return err(new ParsingError(`net conf showshare returned invalid data:\n${shareConfig}`));
        }
        return SambaShareParser(shareName).apply(shareIniData[shareName]!);
      });
  }

  parseGlobalConfig(globalConfig: string): Result<SambaGlobalConfig, ParsingError> {
    return SambaConfParser()
      .apply(globalConfig)
      .map(({ global }) => global);
  }

  parseConfig(config: string): Result<SambaConfig, ParsingError> {
    return SambaConfParser().apply(config);
  }

  unparseConfig(config: SambaConfig): Result<string, ParsingError> {
    return SambaConfParser().unapply(config);
  }

  recommendedGlobalDefaults(): Result<SambaGlobalConfig, ParsingError> {
    return SambaConfParser()
      .apply(recommendedDefaultsConf)
      .map(({ global }) => global);
  }

  recommendedShareDefaults(): Result<SambaShareConfig, ParsingError> {
    return SambaConfParser()
      .apply(recommendedDefaultsConf)
      .andThen((conf) =>
        conf.shares.length
          ? ok(conf.shares[0]!)
          : err(new ParsingError("Share definition missing from recommended-defaults.conf"))
      );
  }

  abstract getGlobalConfig(): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError>;

  abstract editGlobal(
    globalConfig: SambaGlobalConfig
  ): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError>;

  abstract listShareNames(): ResultAsync<string[], ParsingError | ProcessError>;

  abstract getShare(shareName: string): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  abstract getShares(): ResultAsync<SambaShareConfig[], ParsingError | ProcessError>;

  abstract exportConfig(): ResultAsync<string, ProcessError>;

  abstract importConfig(config: string): ResultAsync<this, ProcessError>;

  setUserPassword(user: string, passwd: string): ResultAsync<void, ProcessError> {
    const proc = this.server.spawnProcess(
      new Command(["smbpasswd", "-a", "-s", user], { superuser: "try" })
    );
    proc.write(`${passwd}\n${passwd}\n`);

    return proc.wait().map(() => {});
  }

  /**
   * Remove user's smbpasswd
   * @param user
   */
  removeUserPassword(user: string): ResultAsync<void, ProcessError> {
    return this.server
      .execute(new Command(["smbpasswd", "-x", user], { superuser: "try" }))
      .map(() => {});
  }

  /**
   * Check if user has smbpasswd set
   * @param user
   */
  userHasPassword(user: string): ResultAsync<boolean, ProcessError> {
    return this.server
      .execute(new Command(["pdbedit", "-L", "-u", user], { superuser: "try" }), false)
      .map((proc) => !proc.failed());
  }

  abstract addShare(
    share: SambaShareConfig
  ): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  abstract editShare(
    share: SambaShareConfig
  ): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  abstract removeShare(
    share: SambaShareConfig
  ): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  renameShare(
    oldName: string,
    newName: string
  ): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return this.getShare(oldName).andThen((originalShare) =>
      this.addShare({ ...originalShare, name: newName }).andThen((newShare) =>
        this.removeShare(originalShare).map(() => newShare)
      )
    );
  }

  closeSambaShare(sharename: string): ResultAsync<void, ProcessError> {
    return this.server
      .execute(new Command(["smbcontrol", "smbd", "close-share", sharename], { superuser: "try" }))
      .map(() => {});
  }

  getServer(): Server {
    return this.server;
  }
}

export class SambaManagerNet extends SambaManagerBase implements ISambaManager {
  private commandOptions: CommandOptions;

  constructor(server: Server = defaultServer) {
    super(server);
    this.commandOptions = {
      superuser: "try",
    };
  }

  private netConfCommand(...args: string[]) {
    return new Command(["net", "conf", ...args], this.commandOptions);
  }

  private listShareNamesCommand() {
    return this.netConfCommand("listshares");
  }

  private addShareCommand(name: string, path: string) {
    return this.netConfCommand("addshare", name, path);
  }

  private setParmCommand(section: string, param: string, value: string) {
    return this.netConfCommand("setparm", section, param, value);
  }

  private delParmCommand(section: string, param: string) {
    return this.netConfCommand("delparm", section, param);
  }

  private showShareCommand(section: string) {
    return this.netConfCommand("showshare", section);
  }

  private delShareCommand(section: string) {
    return this.netConfCommand("delshare", section);
  }

  private setSectionParams(section: string, params: KeyValueData) {
    return ResultAsync.combine(
      Object.entries(params).map(([key, value]) =>
        this.server.execute(this.setParmCommand(section, key, value), true)
      )
    );
  }

  private delSectionParms(section: string, params: string[]) {
    return ResultAsync.combine(
      params.map((param) => this.server.execute(this.delParmCommand(section, param), true))
    );
  }

  getGlobalConfig() {
    return this.server
      .execute(this.showShareCommand("global"), false)
      .andThen((p) => {
        if (p.succeeded()) {
          return ok(p.getStdout());
        }
        if (p.getStdout().includes("SBC_ERR_NO_SUCH_SERVICE")) {
          return ok("[global]\n");
        }
        return err(new ProcessError(p.prefixMessage(p.getStdout() + p.getStderr())));
      })
      .andThen((output) => this.parseGlobalConfig(output));
  }

  editGlobal(globalConfig: SambaGlobalConfig) {
    const globalParser = SambaGlobalParser();
    const originalGlobalConfigKV = this.getGlobalConfig().andThen(globalParser.unapply);
    const newGlobalConfigKV = globalParser.unapply(globalConfig).asyncAndThen(okAsync);
    return ResultAsync.combine([originalGlobalConfigKV, newGlobalConfigKV])
      .map(([originalGlobalKV, newGlobalKV]) => keyValueDiff(originalGlobalKV, newGlobalKV))
      .andThen(({ added, removed, changed }) =>
        this.setSectionParams("global", { ...added, ...changed }).andThen(() =>
          this.delSectionParms("global", Object.keys(removed))
        )
      )
      .map(() => globalConfig);
  }

  listShareNames() {
    return this.server
      .execute(this.listShareNamesCommand())
      .map((p) => p.getStdout())
      .map(StringUtils.splitBy(RegexSnippets.newlineSplitter))
      .map(
        StringUtils.filter(
          StringUtils.nonEmptyFilter(),
          (shareName) => shareName.toLowerCase() !== "global"
        )
      );
  }

  getShare(shareName: string) {
    return this.server
      .execute(this.showShareCommand(shareName))
      .map((p) => p.getStdout())
      .andThen((shareConf) => this.parseShareConfig(shareConf));
  }

  getShares() {
    return this.listShareNames().andThen((shareNames) =>
      ResultAsync.combine(shareNames.map((shareName) => this.getShare(shareName)))
    );
  }

  addShare(share: SambaShareConfig) {
    console.log("addshare:", share);

    return SambaShareParser(share.name)
      .unapply(share)
      .asyncAndThen((shareParams) =>
        this.server
          .execute(this.addShareCommand(share.name, share.path), true)
          .andThen(() => this.setSectionParams(share.name, shareParams))
      )
      .map(() => share);
  }

  editShare(share: SambaShareConfig) {
    const shareParser = SambaShareParser("");
    const originalShareKV = this.getShare(share.name).andThen(shareParser.unapply);
    const newShareKV = shareParser.unapply(share).asyncAndThen(okAsync);
    return ResultAsync.combine([originalShareKV, newShareKV])
      .map(([originalShareKV, newShareKV]) => keyValueDiff(originalShareKV, newShareKV))
      .andThen(({ added, removed, changed }) =>
        this.setSectionParams(share.name, { ...added, ...changed }).andThen(() =>
          this.delSectionParms(share.name, Object.keys(removed))
        )
      )
      .map(() => share);
  }

  removeShare(share: SambaShareConfig) {
    const shareName = typeof share === "string" ? share : share.name;
    return this.server.execute(this.delShareCommand(shareName)).map(() => share);
  }

  exportConfig() {
    return this.server.execute(this.netConfCommand("list")).map((proc) => proc.getStdout());
  }

  importConfig(config: string) {
    return File.makeTemp(this.server)
      .andThen((confFile) =>
        confFile.write(
          // remove include = registry or config backend = registry
          config.replace(/^[ \t]*(include|config backend)[ \t]*=[ \t]*registry.*$\n?/im, "")
        )
      )
      .andThen((confFile) => this.server.execute(this.netConfCommand("import", confFile.path)))
      .map(() => this);
  }

  checkIfSambaConfIncludesRegistry(sambaConfPath: string) {
    return new File(this.server, sambaConfPath)
      .assertExists()
      .andThen((sambaConf) => sambaConf.read())
      .andThen(IniSyntax({ duplicateKey: "append" }).apply)
      .map((sambaConf) => [sambaConf.global?.include ?? []].flat().includes("registry"));
  }

  patchSambaConfIncludeRegistry(sambaConfPath: string) {
    return new File(this.server, sambaConfPath)
      .assertExists()
      .andThen((sambaConf) =>
        sambaConf.replace(
          (currentConfig) =>
            currentConfig.replace(
              // last line of [global] section
              /^\s*\[ ?global ?\]\s*$(?:\n^(?!;?\s*\[).*$)*/im,
              "$&\n\t# inclusion of net registry, inserted by cockpit-file-sharing:\n\tinclude = registry\n"
            ),
          this.commandOptions
        )
      )
      .map(() => this);
  }

  importFromSambaConf(sambaConfPath: string) {
    return new File(this.server, sambaConfPath)
      .assertExists()
      .andThen((sambaConfFile) =>
        sambaConfFile
          .read(this.commandOptions)
          .andThen((sambaConf) => this.importConfig(sambaConf))
          .andThen(() =>
            sambaConfFile.replace(
              "# this config was generated by cockpit-file-sharing after importing samba.conf\n" +
                `# original samba.conf location: ${sambaConfPath}.~N~\n` +
                "[global]\n" +
                "	include = registry\n",
              { ...this.commandOptions, backup: true }
            )
          )
      )
      .map(() => this);
  }
}

export class SambaManagerConfFile extends SambaManagerBase implements ISambaManager {
  private commandOptions: CommandOptions;

  constructor(protected confFile: File) {
    super(confFile.server);
    this.commandOptions = {
      superuser: "try",
    };
  }

  private reloadConfig() {
    return this.confFile.server
      .execute(new Command(["smbcontrol", "smbd", "reload-config"], this.commandOptions))
      .map(() => {});
  }

  private modifyConfigFileText<TErr extends Error>(
    callback: (config: string) => Result<string, TErr>
  ) {
    return this.exportConfig().andThen((originalContents) => {
      const newContents = callback(originalContents);

      return newContents.asyncAndThen((newContents) =>
        this.confFile
          .replace(newContents, this.commandOptions)
          .andThen(() => this.reloadConfig())
          .orElse((e) =>
            // if reloadConfig fails, roll back
            this.confFile.replace(originalContents, this.commandOptions).andThen(() => err(e))
          )
      );
    });
  }

  private modifyConfigFile<TErr extends Error>(
    callback: (config: SambaConfig) => Result<SambaConfig, TErr>
  ) {
    return this.modifyConfigFileText((confText) =>
      this.parseConfig(confText)
        .andThen(callback)
        .andThen((conf) => this.unparseConfig(conf))
    );
  }

  getGlobalConfig(): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError> {
    return this.exportConfig()
      .andThen((confText) => this.parseConfig(confText))
      .map(({ global }) => global);
  }

  editGlobal(
    globalConfig: SambaGlobalConfig
  ): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError> {
    return this.modifyConfigFile((config) => ok({ ...config, global: globalConfig })).map(
      () => globalConfig
    );
  }

  getShares(): ResultAsync<SambaShareConfig[], ParsingError | ProcessError> {
    return this.exportConfig()
      .andThen((confText) => this.parseConfig(confText))
      .map(({ shares }) => shares);
  }

  listShareNames(): ResultAsync<string[], ProcessError> {
    return this.getShares().map((shares) => shares.map(({ name }) => name));
  }

  getShare(shareName: string): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return this.getShares()
      .map((shares) => shares.find((share) => share.name === shareName))
      .andThen((shareOrUndefined) =>
        shareOrUndefined === undefined
          ? err(new ProcessError(`Share not found: ${shareName}`))
          : ok(shareOrUndefined)
      );
  }

  addShare(share: SambaShareConfig): ResultAsync<SambaShareConfig, ProcessError> {
    return this.modifyConfigFile((config) => {
      const shareExists = config.shares.find((s) => s.name === share.name) !== undefined;
      if (shareExists) {
        return err(new ProcessError(`Share already exists: ${share.name}`));
      }
      config.shares.push(share);
      return ok(config);
    }).map(() => share);
  }

  editShare(share: SambaShareConfig): ResultAsync<SambaShareConfig, ProcessError> {
    return this.modifyConfigFile((config) => {
      const shareExists = config.shares.find((s) => s.name === share.name) !== undefined;
      if (!shareExists) {
        return err(new ProcessError(`Share not found: ${share.name}`));
      }
      config.shares = config.shares.map((s) => (s.name === share.name ? share : s));
      return ok(config);
    }).map(() => share);
  }

  removeShare(share: SambaShareConfig): ResultAsync<SambaShareConfig, ProcessError> {
    return this.modifyConfigFile((config) => {
      const shareExists = config.shares.find((s) => s.name === share.name) !== undefined;
      if (!shareExists) {
        return err(new ProcessError(`Share not found: ${share.name}`));
      }
      config.shares = config.shares.filter((s) => s.name !== share.name);
      return ok(config);
    }).map(() => share);
  }

  exportConfig(): ResultAsync<string, ProcessError> {
    return this.confFile.read(this.commandOptions);
  }

  importConfig(config: string): ResultAsync<this, ProcessError> {
    return this.modifyConfigFileText(() => ok(config)).map(() => this);
  }
}
