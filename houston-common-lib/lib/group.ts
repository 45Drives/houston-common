import { Server } from "@/server";

export type Group = {
  server: Server;
  name?: string;
  gid: number;
  members?: string[];
};

export type LocalGroup = Required<Group>;

export function Group(
  server: Server,
  name: string | undefined,
  gid: number,
  members: string[] | undefined
): Group {
  return {
    server,
    name,
    gid,
    members,
  };
}

export function isLocalGroup(group: Group): group is LocalGroup {
  return [group.name, group.members].every((prop) => prop !== undefined);
}
