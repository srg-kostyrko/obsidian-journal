import type { Response } from "express";

// Anything not listed answers 500, so an unknown code never reads as the caller's fault.
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  "journal-not-found": 404,
  "no-matching-journal": 404,
  "notelet-type-not-found": 404,
  "outside-timeline": 404,
  "note-not-found": 404,
  "invalid-date": 400,
  "invalid-answers": 400,
  "invalid-request": 400,
  "unmappable-date": 422,
  "prompts-required": 409,
};

/** An error raised at the REST boundary, carrying a code `JournalsApi` itself may never throw. */
export class RestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly journal?: string,
  ) {
    super(message);
  }
}

export function statusFor(code: string): number {
  return STATUS_BY_CODE[code] ?? 500;
}

export function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code: unknown = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

export interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly journal?: unknown;
  readonly issues?: unknown;
}

export function errorBody(error: unknown): ErrorBody {
  const code = readErrorCode(error);
  if (code === undefined) {
    return { code: "internal-error", message: error instanceof Error ? error.message : String(error) };
  }
  // readErrorCode already confirmed error is a non-null object, so this record read is safe.
  const record = error as Record<string, unknown>;
  // Falling back to the code (rather than String(record.message), which reads "undefined" for a
  // genuinely missing message) keeps the body meaningful when a caller throws a bare {code}.
  const message = typeof record.message === "string" ? record.message : code;
  return {
    code,
    message,
    ...(record.journal !== undefined && { journal: record.journal }),
    ...(record.issues !== undefined && { issues: record.issues }),
  };
}

export function sendError(response: Response, error: unknown): void {
  const body = errorBody(error);
  // statusFor answers 500 for internal-error, like any code it does not list.
  response.status(statusFor(body.code)).json(body);
}
