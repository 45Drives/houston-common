import { Server } from "@/server";
import { User } from "@/user";

export class Group {
  constructor(
    public server: Server,
    public name: string,
    public gid: number,
    public _memberLogins: string[]
  ) {}

  getMembers(): User[] {
    return []; // TODO
  }

  // getPrimaryMember(): User | null {
  //   // TODO
  // }
}
