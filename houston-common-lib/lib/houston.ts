import { ProcessError } from "@/errors";
import { Server } from "@/server";
import { ResultAsync } from "neverthrow";

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
