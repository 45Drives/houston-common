import { ParsingError, ProcessError } from "@/errors";
import { SambaGlobalConfig, SambaShareConfig } from "@/typedoc.index";
import { errAsync, ResultAsync } from "neverthrow";
import { SambaManagerBase } from "./manager";
import { suite, test, expect } from "vitest";

class SambaManagerTest extends SambaManagerBase {
  addShare(_: SambaShareConfig): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return errAsync(new Error());
  }

  editGlobal(
    _: SambaGlobalConfig
  ): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError> {
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
  const mgr = new SambaManagerTest();
  test("recommended defaults from conf file", () => {
    expect(mgr.recommendedGlobalDefaults().isOk()).toBe(true);
    expect(mgr.recommendedShareDefaults().isOk()).toBe(true);
  });
});
