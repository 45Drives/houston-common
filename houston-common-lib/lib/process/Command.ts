export type CommandOptions = {
  directory?: string;
  environ?: Record<string, string>;
  pty?: boolean;
  superuser?: "try" | "require";
  arg0?: string;
};

export class Command {
  public readonly argv: string[];
  public readonly options: CommandOptions;

  constructor(argv: string[], opts: CommandOptions = {}) {
    this.argv = argv;
    this.options = opts;
  }

  public getName(): string {
    return this.options.arg0 ?? this.argv[0] ?? "";
  }

  public toString(): string {
    return `Command(${JSON.stringify(this.argv)}, ${JSON.stringify(this.options)})`;
  }
}

export class BashCommand extends Command {
  constructor(script: string, args: string[] = [], opts: CommandOptions = {}) {
    opts.arg0 ??= "HoustonBashCommand";
    super(["/usr/bin/env", "bash", "-c", script, opts.arg0, ...args], opts);
  }
}

export class PythonCommand extends Command {
  constructor(script: string, args: string[] = [], opts: CommandOptions = {}) {
    opts.arg0 ??= "HoustonPythonCommand";
    super(["/usr/bin/env", "python3", "-c", script, ...args], opts);
  }
}
