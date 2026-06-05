import { ParsingError, ProcessError } from "@/errors";
import { SambaGlobalConfig, SambaShareConfig } from "./types";
import { errAsync, ResultAsync } from "neverthrow";
import { SambaManagerBase, SambaManagerNet } from "./manager";
import { server } from "@/houston";
import { unwrap } from "@/unwrap";
import { suite, test, expect } from "vitest";
import fs from "fs";

class SambaManagerTest extends SambaManagerBase {
  addShare(_: SambaShareConfig): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  editGlobal(_: SambaGlobalConfig): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  editShare(_: SambaShareConfig): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  exportConfig(): ResultAsync<string, ProcessError> {
    return errAsync(new Error());
  }

  getGlobalConfig(): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  getShare(_: string): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  getShares(): ResultAsync<SambaShareConfig[], ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  importConfig(_: string): ResultAsync<this, ProcessError> {
    return errAsync(new Error());
  }

  listShareNames(): ResultAsync<string[], ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  removeShare(_: SambaShareConfig): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return errAsync(new Error());
  }
}

suite("SambaManager", () => {
  test("recommended defaults from conf file", () => {
    const mgr = new SambaManagerTest(server);
    expect(mgr.recommendedGlobalDefaults().isOk()).toBe(true);
    expect(mgr.recommendedShareDefaults().isOk()).toBe(true);
  });

  suite("patchSambaConfIncludeRegistry", () => {
    const mgr = new SambaManagerNet(server);
    const smbConfPath = "/tmp/smb.conf";
    test("no config file", async () => {
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(false);
      expect(fs.existsSync(smbConfPath)).toBe(false);
      await expect(unwrap(mgr.patchSambaConfIncludeRegistry(smbConfPath))).resolves.toBe(mgr);
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(true);
    });
    test("empty config file", async () => {
      fs.writeFileSync(smbConfPath, "");
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(false);
      expect(fs.existsSync(smbConfPath)).toBe(true);
      await expect(unwrap(mgr.patchSambaConfIncludeRegistry(smbConfPath))).resolves.toBe(mgr);
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(true);
    });
    test("config file with global section, no include", async () => {
      fs.writeFileSync(
        smbConfPath,
        `
[global]
\tworkgroup = WORKGROUP
\tserver string = Samba Server
\tlog level = 1
`
      );
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(false);
      await expect(unwrap(mgr.patchSambaConfIncludeRegistry(smbConfPath))).resolves.toBe(mgr);
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(true);
    });
    test("file already has include = registry", async () => {
      const content = `
[global]
\tworkgroup = WORKGROUP
\tserver string = Samba Server
\tlog level = 1
\tinclude = registry
`;
      fs.writeFileSync(smbConfPath, content);
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(true);
      await expect(unwrap(mgr.patchSambaConfIncludeRegistry(smbConfPath))).resolves.toBe(mgr);
      await expect(unwrap(mgr.checkIfSambaConfIncludesRegistry(smbConfPath))).resolves.toBe(true);
      expect(fs.readFileSync(smbConfPath, "utf-8")).toBe(content);
    });
    fs.rmSync(smbConfPath, { force: true });
  });
});
