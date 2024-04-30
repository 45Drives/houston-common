import { Server } from "@/server";

export type Group = {
  server: Server;
  name: string;
  gid: number;
  members: string[];
};

export function Group(
  server: Server,
  name: string,
  gid: number,
  members: string[]
) {
  return {
    server,
    name,
    gid,
    members,
  };
}
