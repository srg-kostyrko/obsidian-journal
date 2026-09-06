import { parseDateExpression, type CalendarDate } from "@/calendar";
import type { OpenMode } from "@/infrastructure/host";
import { Err, Ok } from "@/infrastructure/result";
import type { Result } from "@/infrastructure/result";

import {
  InvalidUriDateError,
  InvalidUriOpenModeError,
  MissingUriTargetError,
  NoteletUriRequiresJournalError,
  UnknownUriWriteTypeError,
} from "./errors";

import type { UriError } from "./errors";

const WRITE_TYPES = ["day", "week", "month", "quarter", "year"] as const;
const OPEN_MODES = ["active", "tab", "split", "window"] as const;

export type JournalUriWriteType = (typeof WRITE_TYPES)[number];

export type JournalUriTarget =
  | { readonly kind: "journal"; readonly name: string }
  | { readonly kind: "type"; readonly writeType: JournalUriWriteType };

export interface JournalUriRequest {
  readonly target: JournalUriTarget;
  readonly date: CalendarDate;
  readonly openMode: OpenMode;
  readonly notelet?: string;
}

export function parseJournalUriRequest(
  parameters: Record<string, string | undefined>,
): Result<JournalUriRequest, UriError> {
  const trimmed = parameters.notelet?.trim();
  const notelet = trimmed === undefined || trimmed === "" ? undefined : trimmed;

  const target = parseTarget(parameters);
  // A notelet type name is only unique within one journal, so a missing or write-type target gets
  // the specific refusal rather than parseTarget's generic one.
  if (notelet !== undefined && !(target.isOk() && target.value.kind === "journal")) {
    return new Err(new NoteletUriRequiresJournalError(notelet));
  }
  if (target.isErr()) return new Err(target.error);

  const date = parseDate(parameters.date);
  if (date.isErr()) return new Err(date.error);

  const openMode = parseOpenMode(parameters.mode);
  if (openMode.isErr()) return new Err(openMode.error);

  return new Ok({
    target: target.value,
    date: date.value,
    openMode: openMode.value,
    ...(notelet !== undefined && { notelet }),
  });
}

function parseTarget(parameters: Record<string, string | undefined>): Result<JournalUriTarget, UriError> {
  const name = parameters.journal?.trim();
  if (name) return new Ok({ kind: "journal", name });

  const type = parameters.type?.trim();
  if (!type) return new Err(new MissingUriTargetError());
  if (!isWriteType(type)) return new Err(new UnknownUriWriteTypeError(type));
  return new Ok({ kind: "type", writeType: type });
}

function parseDate(raw: string | undefined): Result<CalendarDate, UriError> {
  const parsed = parseDateExpression(raw ?? "");
  if (parsed.isNone()) return new Err(new InvalidUriDateError((raw ?? "").trim()));
  return new Ok(parsed.value);
}

function parseOpenMode(raw: string | undefined): Result<OpenMode, UriError> {
  const value = raw?.trim();
  if (!value) return new Ok("active");
  if (!isOpenMode(value)) return new Err(new InvalidUriOpenModeError(value));
  return new Ok(value);
}

function isWriteType(value: string): value is JournalUriWriteType {
  return (WRITE_TYPES as readonly string[]).includes(value);
}

function isOpenMode(value: string): value is OpenMode {
  return (OPEN_MODES as readonly string[]).includes(value);
}
