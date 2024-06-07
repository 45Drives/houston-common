import { ParsingError, ProcessError } from "@/errors";
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

export function getServer(
  host: string = "localhost"
): ResultAsync<Server, ProcessError> {
  const server = new Server(host);
  return server.isAccessible().map(() => server);
}

export namespace _internal {
  type PcsClusterConfigOutput = {
    nodes: { name: string; addrs: { addr: string }[] }[];
  };
  export const pcsNodesParseAddrs = (commandOutput: string) =>
    safeJsonParse<PcsClusterConfigOutput>(commandOutput).andThen(
      (clusterConfig) => {
        const addrs =
          clusterConfig.nodes
            ?.map((node) => node.addrs[0]?.addr)
            .filter((addr): addr is string => addr !== undefined) ?? [];
        if (addrs.length === 0) {
          console.warn("pcs cluster config output:", clusterConfig);
          return err(new ParsingError("no nodes found in output"));
        }
        return ok(addrs);
      }
    );
}

export function getServerCluster(
  scope: "local" | "ctdb" | "pcs",
  localServer?: Server
): ResultAsync<[Server, ...Server[]], ProcessError | ParsingError> {
  const localServerResult = localServer ? okAsync(localServer) : getServer();
  switch (scope) {
    case "local":
      return localServerResult.map((s) => [s]);
    case "ctdb":
      return localServerResult.andThen((server) => {
        const ctdbNodesFile = new File(server, "/etc/ctdb/nodes");
        return ctdbNodesFile.exists().andThen((ctdbNodesFileExists) => {
          if (ctdbNodesFileExists) {
            return ctdbNodesFile
              .read({ superuser: "try" })
              .andThen((nodesString) =>
                ResultAsync.combine(
                  nodesString
                    .split(RegexSnippets.newlineSplitter)
                    .map((n) => n.trim())
                    .filter((n) => n)
                    .map((node) => getServer(node))
                ).map((servers) => {
                  if (servers.length < 1) {
                    console.warn(
                      "getServerCluster('ctdb'): Found /etc/ctdb/nodes file, but contained no hosts. Assuming single-server."
                    );
                    return [server] as [Server, ...Server[]];
                  }
                  return servers as [Server, ...Server[]];
                })
              );
          } else {
            console.warn(
              "getServerCluster('ctdb'): File not found: /etc/ctdb/nodes. Assuming single-server."
            );
            return ok([server] as [Server, ...Server[]]);
          }
        });
      });
    case "pcs":
      return localServerResult.andThen((localServer) =>
        localServer
          .execute(
            new Command(
              ["pcs", "cluster", "config", "--output-format", "json"],
              {
                superuser: "try",
              }
            )
          )
          .map((proc) => proc.getStdout())
          .andThen(_internal.pcsNodesParseAddrs)
          .andThen((hosts) =>
            ResultAsync.combine(hosts.map((host) => getServer(host))).map(
              (servers) => servers as [Server, ...Server[]]
            )
          )
          .orElse((e) => {
            console.warn(e);
            console.warn("assuming single-server");
            return okAsync([localServer] as [Server, ...Server[]]);
          })
      );
  }
}
