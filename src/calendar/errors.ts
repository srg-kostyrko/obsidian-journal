export class DateTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateTimeError";
  }
}

export class ParseError extends DateTimeError {
  constructor(
    readonly input: string,
    readonly format?: string,
  ) {
    super(format ? `Cannot parse "${input}" with format "${format}"` : `Cannot parse "${input}"`);
    this.name = "ParseError";
  }
}
