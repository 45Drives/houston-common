import { ParsingError, ProcessError } from "@/errors";
import { Server } from "@/server";
import { RegexSnippets } from "@/syntax";
import { safeJsonParse } from "@/utils";
import { File } from "@/path";
import { ResultAsync, ok, err, okAsync } from "neverthrow";

export * from "@/server";
export * from "@/process";
export * from "@/path";
export * from "@/user";
export * from "@/group";
export * from "@/filesystem";

export function getServer(host: string = "localhost"): ResultAsync<Server, ProcessError> {
  const server = new Server(host);
  return server.isAccessible().map(() => server);
}

export namespace _internal {
  type PcsClusterConfigOutput = {
    nodes: { name: string; addrs: { addr: string }[] }[];
  };
  export const pcsNodesParseAddrs = (commandOutput: string) =>
    safeJsonParse<PcsClusterConfigOutput>(commandOutput).andThen((clusterConfig) => {
      const addrs =
        clusterConfig.nodes
          ?.map((node) => node.addrs[0]?.addr)
          .filter((addr): addr is string => addr !== undefined) ?? [];
      if (addrs.length === 0) {
        console.warn("pcs cluster config output:", clusterConfig);
        return err(new ParsingError("no nodes found in output"));
      }
      return ok(addrs);
    });

  export const parseCorosyncConfNodeIps = (corosyncConf: string) =>
    corosyncConf
      .split(RegexSnippets.newlineSplitter)
      .filter((line) => /^\s*ring0_addr\s*:\s*.+$/.test(line))
      .map((ring0Addr) => ring0Addr.split(":")[1]!.trim());
}

export function getServerCluster(
  scope: "local" | "ctdb" | "pcs",
  localServer?: Server
): ResultAsync<[Server, ...Server[]], ProcessError | ParsingError> {
  const localServerResult = localServer ? okAsync(localServer) : getServer();
  const getServerResults = (): ResultAsync<
    ResultAsync<Server, ProcessError | ParsingError>[],
    ProcessError
  > => {
    switch (scope) {
      case "local":
        return okAsync([localServerResult]);
      case "ctdb":
        return localServerResult.andThen((server) => {
          const ctdbNodesFile = new File(server, "/etc/ctdb/nodes");
          return ctdbNodesFile.exists().andThen((ctdbNodesFileExists) => {
            if (ctdbNodesFileExists) {
              return ctdbNodesFile.read({ superuser: "try" }).map((nodesString) =>
                nodesString
                  .split(RegexSnippets.newlineSplitter)
                  .map((n) => n.trim())
                  .filter((n) => n)
                  .map((ip) => getServer(ip))
              );
            } else {
              console.warn(
                "getServerCluster('ctdb'): File not found: /etc/ctdb/nodes. Assuming single-server."
              );
              return okAsync([okAsync<Server, ProcessError | ParsingError>(server)]);
            }
          });
        });
      case "pcs":
        return localServerResult.andThen((server) => {
          const corosyncConfFile = new File(server, "/etc/corosync/corosync.conf");
          return corosyncConfFile.exists().andThen((corosyncConfFileExists) => {
            if (corosyncConfFileExists) {
              return corosyncConfFile.read({ superuser: "try" }).map((confString) =>
                _internal.parseCorosyncConfNodeIps(confString)
                  .map((ip) => getServer(ip))
              );
            } else {
              console.warn(
                "getServerCluster('pcs'): File not found: /etc/corosync/corosync.conf. Assuming single-server."
              );
              return okAsync([okAsync<Server, ProcessError | ParsingError>(server)]);
            }
          });
        });
    }
  };

  return getServerResults()
    .map((serverResults) => Promise.all(serverResults))
    .map(
      (serverResults) =>
        serverResults
          .map((serverResult) =>
            serverResult.match(
              (s) => s,
              (e) => {
                window.reportHoustonError(e, `While getting ${scope} cluster hosts:`);
                return null;
              }
            )
          )
          .filter((s): s is Server => s !== null)
    )
    .andThen((servers) =>
      servers.length > 0 ? ok(servers as [Server, ...Server[]]) : err(new ProcessError("No acessible servers in cluster."))
    )
    .orElse((e) => {
      window.reportHoustonError(e, "Assuming single server:");
      return localServerResult.map((s) => [s] as [Server, ...Server[]]);
    });
}
