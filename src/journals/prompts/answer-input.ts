import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { hasUnlinkableCharacters } from "@/ui/note-link-characters";

import { isLongText, isRequired, type Prompt, type PromptAnswer } from "./config";
import { toNoteLink } from "./note-link";
import { isPlaceholder } from "./placeholder";
import { promptsInPath, type PromptOwner } from "./prompts-in-path";

export interface AnswerIssue {
  readonly variable: string;
  readonly reason: string;
}

/** The link text Obsidian would write for the file at `path`; undefined when there is no file. */
export type LinkTextResolver = (path: string) => string | undefined;

type Read = { kind: "answer"; value: PromptAnswer } | { kind: "blank" } | { kind: "issue"; reason: string };

const blank: Read = { kind: "blank" };
const issue = (reason: string): Read => ({ kind: "issue", reason });
const answer = (value: PromptAnswer): Read => ({ kind: "answer", value });

function readText(prompt: Prompt, value: unknown): Read {
  if (typeof value !== "string") return issue("expected a string");
  if (value.trim() === "") return blank;
  if (isPlaceholder(value)) return issue(`"${value}" is reserved for an unanswered question`);
  if (!isLongText(prompt) && /[\r\n]/.test(value)) return issue("this question takes one line");
  return answer(value);
}

function readNote(value: unknown, linkTextFor: LinkTextResolver): Read {
  if (typeof value !== "string") return issue("expected a vault path");
  if (value.trim() === "") return blank;
  const linkText = linkTextFor(value);
  // Stricter than the answer dialog, which keeps a link to a note not written yet: a person sees
  // their typo there, a caller would leave a dangling link without knowing.
  if (linkText === undefined) return issue(`no file at "${value}"; give the full path with its extension`);
  if (hasUnlinkableCharacters(linkText)) return issue("the file's name holds # ^ | [ or ], which a link cannot carry");
  const link = toNoteLink(linkText);
  return link === undefined ? blank : answer(link);
}

function readOne(prompt: Prompt, value: unknown, linkTextFor: LinkTextResolver): Read {
  if (value === undefined || value === null) return blank;
  return match(prompt)
    .with({ type: "text" }, (text) => readText(text, value))
    .with({ type: "number" }, () =>
      typeof value === "number" && Number.isFinite(value) ? answer(value) : issue("expected a finite number"),
    )
    .with({ type: "date" }, () => {
      if (typeof value !== "string") return issue("expected a date as YYYY-MM-DD");
      if (value.trim() === "") return blank;
      // ISO is already how an answered date is held; the question's format applies only when it renders.
      const parsed = CalendarDate.parse(value);
      return parsed.isOk() ? answer(parsed.value.toAnchor()) : issue("expected a date as YYYY-MM-DD");
    })
    .with({ type: "toggle" }, () => (typeof value === "boolean" ? answer(value) : issue("expected true or false")))
    .with({ type: "select" }, (select) => {
      if (value === "") return blank;
      const values = select.options.map((option) => option.value);
      return typeof value === "string" && values.includes(value)
        ? answer(value)
        : issue(`expected one of: ${values.join(", ")}`);
    })
    .with({ type: "note" }, () => readNote(value, linkTextFor))
    .exhaustive();
}

/** Reads a caller's answers against the questions `owner` asks, reporting every problem at once. */
export function readAnswerInput(
  owner: PromptOwner,
  input: Readonly<Record<string, unknown>>,
  linkTextFor: LinkTextResolver,
): Result<Record<string, PromptAnswer>, readonly AnswerIssue[]> {
  const issues: AnswerIssue[] = [];
  const known = new Set(owner.prompts.map((prompt) => prompt.variable));
  for (const variable of Object.keys(input)) {
    if (!known.has(variable)) issues.push({ variable, reason: "no question uses this variable" });
  }

  const inPath = new Set(promptsInPath(owner).map((prompt) => prompt.variable));
  // Collected as entries and turned into a record at the end, rather than assigned key by key:
  // a variable named `__proto__` assigned with `answers[variable] = …` hits the inherited
  // prototype setter instead of creating an own property, so `Object.fromEntries` is load-bearing
  // here, not cosmetic.
  const entries: [string, PromptAnswer][] = [];
  for (const prompt of owner.prompts) {
    const { variable } = prompt;
    // Own data properties only: an inherited value must not read as an answer, and neither must
    // an accessor — a getter runs arbitrary code the caller does not control.
    const descriptor = Object.getOwnPropertyDescriptor(input, variable);
    if (descriptor !== undefined && !("value" in descriptor)) {
      issues.push({ variable, reason: "expected a plain value, not a getter" });
      continue;
    }
    const read = readOne(prompt, descriptor === undefined ? undefined : descriptor.value, linkTextFor);
    if (read.kind === "answer") entries.push([variable, read.value]);
    else if (read.kind === "issue") issues.push({ variable, reason: read.reason });
    else if (inPath.has(variable)) issues.push({ variable, reason: "the note name or folder uses this answer" });
    else if (isRequired(prompt)) issues.push({ variable, reason: "this question is required" });
  }
  return issues.length > 0 ? new Err(issues) : new Ok(Object.fromEntries(entries));
}
