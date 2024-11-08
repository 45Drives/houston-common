import { NotFound, ParsingError, ProcessError } from "@/errors";
import { Command } from "@/process";
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
        return localServerResult.andThen((localServer) =>
          localServer
            .execute(
              new Command(["pcs", "cluster", "config", "--output-format", "json"], {
                superuser: "try",
              })
            )
            .map((proc) => proc.getStdout())
            .andThen(_internal.pcsNodesParseAddrs)
            .map((hosts) => hosts.map((host) => getServer(host)))
            .orElse((e) => {
              if (e instanceof NotFound) {
                console.warn("pcs command not found. Assuming single-server.");
                return okAsync([okAsync<Server, ProcessError | ParsingError>(localServer)]);
              }
              return err(e);
            })
        );
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
          .filter((s): s is Server => s !== null) as [Server, ...Server[]]
    )
    .andThen((servers) =>
      servers.length > 0 ? ok(servers) : err(new ProcessError("No acessible servers in cluster."))
    )
    .orElse((e) => {
      window.reportHoustonError(e, "Assuming single server:");
      return localServerResult.map((s) => [s] as [Server, ...Server[]]);
    });
}
