import { Command, IDriverProcess } from "@/process";
import { Server } from "@/server";

export interface IHoustonDriver {
  Process: new (server: Server, command: Command, defer?: boolean) => IDriverProcess;

  downloadCommandOutputURL(server: Server, command: Command, filename: string): string;

  gettext(message: string): string;
  gettext(context: string, message: string): string;

  localStorage: Omit<Storage, "key" | "length">;
  sessionStorage: Omit<Storage, "key" | "length">;
}
