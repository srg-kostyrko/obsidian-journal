import type { Response } from "express";

// The Global Constraints status map. Anything not listed here answers 500.
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

/** REST-only codes (`note-not-found`, `invalid-request`) that `JournalsApi` never throws. */
export class RestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function statusFor(code: string): number {
  return STATUS_BY_CODE[code] ?? 500;
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code: unknown = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

export function sendError(response: Response, error: unknown): void {
  const code = readErrorCode(error);

  if (code === undefined) {
    const message = error instanceof Error ? error.message : String(error);
    response.status(500).json({ code: "internal-error", message });
    return;
  }

  // readErrorCode already confirmed error is a non-null object, so this record read is safe.
  const record = error as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : String(record.message);
  const body: Record<string, unknown> = { code, message };
  if (record.journal !== undefined) body.journal = record.journal;
  if (record.issues !== undefined) body.issues = record.issues;
  response.status(statusFor(code)).json(body);
}
