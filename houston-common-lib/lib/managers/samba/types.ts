import { type KeyValueData } from "@/index";

export type SambaGlobalConfig = {
  logLevel: number;
  workgroup: string;
  serverString: string;
  advancedOptions: KeyValueData;
};

export type SambaShareConfig = {
  name: string;
  description: string;
  path: string;
  guestOk: boolean;
  readOnly: boolean;
  browseable: boolean;
  inheritPermissions: boolean;
  advancedOptions: KeyValueData;
};

export type SambaConfig = {
  global: SambaGlobalConfig;
  shares: SambaShareConfig[];
};

export namespace SambaShareConfig {
  export const defaults = (name: string = ""): SambaShareConfig => ({
    name,
    description: "",
    path: "",
    guestOk: false,
    browseable: true,
    readOnly: true,
    inheritPermissions: false,
    advancedOptions: {},
  });

  export const makeNew = (): SambaShareConfig => ({
    ...defaults(""),
    readOnly: false,
  });
}

export namespace SambaGlobalConfig {
  export const defaults = (): SambaGlobalConfig => ({
    serverString: "Samba %v",
    logLevel: 0,
    workgroup: "WORKGROUP",
    advancedOptions: {},
  });
}

export namespace SambaConfig {
  export const defaults = (): SambaConfig => ({
    global: SambaGlobalConfig.defaults(),
    shares: [],
  });
}
