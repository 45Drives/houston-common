import { IniConfigData, IniSyntax } from "@/syntax/ini-syntax";
import { ok } from "neverthrow";
import { expect, test, suite } from "vitest";

const testData: {
  raw: string;
  data: IniConfigData;
  cleanRaw: string;
}[] = [
  {
    raw: `# this config was generated by cockpit-file-sharing after importing smb.conf
# original smb.conf location:
# '/etc/samba/smb.conf' -> '/etc/samba/smb.conf.bak' (backup: '/etc/samba/smb.conf.bak.~6~')
[global]
#       include = registry

        # inclusion of net registry, inserted by cockpit-file-sharing:
        include = registry
`,
    data: {
      global: {
        include: "registry",
      },
    },
    cleanRaw: `[global]
\tinclude = registry
`,
  },
  {
    raw: `[global]
\tdelete readonly = yes
\trecycle:versions = True
\trecycle:keeptree = True
\trecycle:touch = True

[win10_share]
\tpath = /home/jboudreau/win10_shared
\tguest ok = no
\tcomment = Shared folder for Windows 10 VM
\tread only = no
\tbrowseable = yes
\tvfs objects = snapshield

[test]
\tpath = /tmp/test
\tguest ok = no
\tcomment = 
\tread only = no
\tbrowseable = yes
\tdelete readonly = yes
\trecycle:versions = True
\trecycle:keeptree = True
\trecycle:touch = True
\tvalid users = 
`,
    data: {
      global: {
        "delete readonly": "yes",
        "recycle:versions": "True",
        "recycle:keeptree": "True",
        "recycle:touch": "True",
      },
      win10_share: {
        path: "/home/jboudreau/win10_shared",
        "guest ok": "no",
        comment: "Shared folder for Windows 10 VM",
        "read only": "no",
        browseable: "yes",
        "vfs objects": "snapshield",
      },

      test: {
        path: "/tmp/test",
        "guest ok": "no",
        comment: "",
        "read only": "no",
        browseable: "yes",
        "delete readonly": "yes",
        "recycle:versions": "True",
        "recycle:keeptree": "True",
        "recycle:touch": "True",
        "valid users": "",
      },
    },
    cleanRaw: `[global]
\tdelete readonly = yes
\trecycle:versions = True
\trecycle:keeptree = True
\trecycle:touch = True

[win10_share]
\tpath = /home/jboudreau/win10_shared
\tguest ok = no
\tcomment = Shared folder for Windows 10 VM
\tread only = no
\tbrowseable = yes
\tvfs objects = snapshield

[test]
\tpath = /tmp/test
\tguest ok = no
\tcomment = 
\tread only = no
\tbrowseable = yes
\tdelete readonly = yes
\trecycle:versions = True
\trecycle:keeptree = True
\trecycle:touch = True
\tvalid users = 
`,
  },
  { raw: "", data: {}, cleanRaw: "\n" },
];

suite("IniSyntax", () => {
  const iniSyntax = IniSyntax({ paramIndent: "\t" });
  for (const { raw, data, cleanRaw } of testData) {
    test("parsing", () => {
      expect(iniSyntax.apply(raw)).toEqual(ok(data));
    });
    test("unparsing", () => {
      expect(iniSyntax.unapply(data)).toEqual(ok(cleanRaw));
    });
    test("apply(unapply(data)) == data", () => {
      expect(ok(data).andThen(iniSyntax.unapply).andThen(iniSyntax.apply)).toEqual(ok(data));
    });
    test("unapply(apply(raw)) == cleanRaw", () => {
      expect(ok(raw).andThen(iniSyntax.apply).andThen(iniSyntax.unapply)).toEqual(ok(cleanRaw));
    });
  }
  suite("duplicateKeys:", () => {
    const input = `[section]
\tkey = value1
\tkey = value2
\tkey = value3
`;
    test("overwrite", () => {
      const iniSyntax = IniSyntax({
        paramIndent: "\t",
        duplicateKey: "overwrite",
      });
      const applyResult = iniSyntax.apply(input);
      expect(applyResult).toEqual(ok({ section: { key: "value3" } }));
      expect(applyResult.andThen(iniSyntax.unapply)).toEqual(ok("[section]\n\tkey = value3\n"));
    });
    test("ignore", () => {
      const iniSyntax = IniSyntax({
        paramIndent: "\t",
        duplicateKey: "ignore",
      });
      const applyResult = iniSyntax.apply(input);
      expect(applyResult).toEqual(ok({ section: { key: "value1" } }));
      expect(applyResult.andThen(iniSyntax.unapply)).toEqual(ok("[section]\n\tkey = value1\n"));
    });
    test("append", () => {
      const iniSyntax = IniSyntax({
        paramIndent: "\t",
        duplicateKey: "append",
      });
      const applyResult = iniSyntax.apply(input);
      expect(applyResult).toEqual(ok({ section: { key: ["value1", "value2", "value3"] } }));
      expect(applyResult.andThen(iniSyntax.unapply)).toEqual(ok(input));
    });
    test("error", () => {
      const iniSyntax = IniSyntax({ paramIndent: "\t", duplicateKey: "error" });
      const applyResult = iniSyntax.apply(input);
      expect(applyResult.isErr()).toEqual(true);
    });
  });
  test("Section name with []", () => {
    const input = `[section]
    key = value
    
    [sec[tion]
    key = value
    
    [s]ection]
    key = value
    
    [s[e]ction]
    key = value`;
    expect(iniSyntax.apply(input)).toEqual(
      ok({
        section: {
          key: "value",
        },
        "sec[tion": {
          key: "value",
        },
        "s]ection": {
          key: "value",
        },
        "s[e]ction": {
          key: "value",
        },
      })
    );
  });
  test("escaped newline", () => {
    const input = `[section]
    key1 = value1
    key2 = a b \\
c
    key3 =\\
12345
`;
    expect(iniSyntax.apply(input)).toEqual(
      ok({
        section: {
          key1: "value1",
          key2: "a b c",
          key3: "12345",
        },
      })
    );
  });
});
