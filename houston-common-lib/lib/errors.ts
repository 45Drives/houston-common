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

export class ValueError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = "ValueError";
  }
}

/**
 * Error that isn't reported in UI
 */
export class SilentError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = "SilentError";
  }
}

export class CancelledByUser extends SilentError {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = "CancelledByUser";
  }
}
