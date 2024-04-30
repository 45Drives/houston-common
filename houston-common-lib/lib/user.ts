import { Directory, File } from "@/path";
import { Server } from "@/server";

export type User = {
  server: Server;
  login: string;
  uid: number;
  gid: number;
  name: string;
  home: Directory;
  shell: File;
};

export function User(
  server: Server,
  login: string,
  uid: number,
  gid: number,
  name: string,
  home: Directory,
  shell: File
) {
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
