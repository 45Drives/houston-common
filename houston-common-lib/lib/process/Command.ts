export type CommandOptions = {
  directory?: string;
  environ?: string[];
  pty?: boolean;
  superuser?: "try" | "require";
};

export class Command {
  public readonly argv: string[];
  public readonly options: CommandOptions;

  constructor(argv: string[], opts: CommandOptions = {}) {
    this.argv = argv;
    this.options = opts;
  }

  public getName(): string {
    return this.argv[0] ?? "";
  }

  public toString(): string {
    return `Command(${JSON.stringify(this.argv)}, ${JSON.stringify(this.options)})`;
  }
}

export class BashCommand extends Command {
  constructor(script: string, args: string[] = [], opts: CommandOptions & { arg0?: string } = {}) {
    const arg0 = opts.arg0 ?? "HoustonBashCommand";
    super(["/usr/bin/env", "bash", "-c", script, arg0, ...args], opts);
  }
}

export class PythonCommand extends Command {
  constructor(script: string, args: string[] = [], opts: CommandOptions = {}) {
    super(["/usr/bin/env", "python3", "-c", script, ...args], opts);
  }
}
