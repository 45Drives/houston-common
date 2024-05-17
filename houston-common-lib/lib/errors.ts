export class ParsingError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = "ParsingError";
  }
}

export class ProcessError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = "ProcessError";
  }
}

export class NonZeroExit extends ProcessError {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = "ProcessError (exited non-zero)";
  }
}
