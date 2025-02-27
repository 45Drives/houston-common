import { BackUpManager, BackUpTask } from "./types";

export class BackUpManagerMac implements BackUpManager {
  queryTasks(): BackUpTask[] {
    throw new Error("not implemented");
  }
  schedule(task: BackUpTask): void {
    throw new Error("not implemented");
  }
  unschedule(task: BackUpTask): void {
    throw new Error("not implemented");
  }
}
