import { Directory, File } from "@/path";
import { Server } from "@/server";

export type User = {
  server: Server;
  login?: string;
  uid: number;
  gid?: number;
  name?: string;
  home?: Directory;
  shell?: File;
};

export type LocalUser = Required<User>;

export function User(
  server: Server,
  login: string | undefined,
  uid: number,
  gid: number | undefined,
  name: string | undefined,
  home: Directory | undefined,
  shell: File | undefined
): User {
  return {
    server,
    login,
    uid,
    gid,
    name,
    home,
    shell,
  };
}

export function isLocalUser(user: User): user is LocalUser {
  return [user.login, user.gid, user.name, user.home, user.shell].every(
    (prop) => prop !== undefined
  );
}
