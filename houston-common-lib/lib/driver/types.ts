import { Command } from "@/process/Command";
import { IDriverProcess } from "@/process/ProcessBase";
import { Server } from "@/server";

export interface IHoustonDriver {
  Process: new (server: Server, command: Command, defer?: boolean) => IDriverProcess;

  downloadCommandOutputURL(server: Server, command: Command, filename: string): string;

  gettext(message: string): string;
  gettext(context: string, message: string): string;

  localStorage: Omit<Storage, "key" | "length">;
  sessionStorage: Omit<Storage, "key" | "length">;
}
