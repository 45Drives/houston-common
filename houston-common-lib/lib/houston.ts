import { Server } from "@/server";
import { Result, Ok, Err } from "@thames/monads";

export * from '@/server';
export * from '@/process';
export * from '@/path';
export * from '@/user';
export * from '@/group';

export async function getServer(host: string = "localhost"): Promise<Result<Server, Error>> {
  const server = new Server(host);
  return (await server.isAccessible()).andThen(() => Ok(server));
}
