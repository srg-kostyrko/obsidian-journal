// tsconfig.app.json (via @vue/tsconfig) sets "types": [] to keep Node globals out of app
// source, and referencing the whole "node" package (its index.d.ts) drags in
// web-globals/timers.d.ts, which redeclares the bare global setTimeout/clearTimeout to return
// NodeJS.Timeout — colliding with window.setTimeout's `number` everywhere else in the app. These
// three submodule files carry no such augmentation, so referencing only them keeps the app's
// global scope untouched.
/// <reference types="node/fs" />
/// <reference types="node/path" />
/// <reference types="node/url" />

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { parseFenceSource, unknownFenceKeys, type CodeBlockDefinition } from "@/infrastructure/host";

import { fenceBlocks, markdownFiles } from "../../scripts/docs-markdown.mjs";

import { codeBlockDefinitions } from "./module";

// Not inlined: Vite's asset-import-meta-url plugin pattern-matches the literal
// `new URL("...", import.meta.url)` shape and rewrites it into an asset-URL resolution, which
// under this project's vitest transform resolves against "http://localhost:3000" instead of the
// file. Binding the base to a variable first keeps the call outside that regex.
const here = import.meta.url;
const MANUAL = fileURLToPath(new URL("../../docs/user", here));

// Our fence names share these prefixes. One that matches but is not registered renders as a
// plain code block in the reader's vault — the mistake #419's own draft made.
const LOOKALIKE = /^(journal|journals|calendar|interval)-/;

// A fence schema degrades a bad value to its default rather than failing, so a clean parse
// proves nothing about a documented option; a value that came back changed was dropped.
function degraded(raw: unknown, output: unknown): boolean {
  if (Array.isArray(raw)) return !Array.isArray(output) || output.length !== raw.length;
  if (output === undefined) return true;
  if (Array.isArray(output)) return output.length !== 1 || String(output[0]) !== String(raw);
  // A valibot-parsed option is a scalar here in every schema this file checks; anything else
  // (an object slipping through) counts as degraded rather than risking a false "unchanged"
  // from comparing its default stringification.
  if (typeof output !== "string" && typeof output !== "number" && typeof output !== "boolean") return true;
  return String(output) !== String(raw);
}

function fenceProblems(definitions: readonly CodeBlockDefinition[], info: string, body: string): string[] {
  const definition = definitions.find((candidate) => candidate.keys.includes(info));
  if (definition === undefined) return LOOKALIKE.test(info) ? [`"${info}" is not a registered code block`] : [];

  const source = parseFenceSource(body);
  if (source.kind === "err") return [`YAML does not parse: ${String(source.error.cause)}`];
  const raw = source.value;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return ["body is not a mapping of options"];

  const parsed = v.safeParse(definition.schema, raw);
  if (!parsed.success) return parsed.issues.map((issue) => issue.message);

  const unknown = unknownFenceKeys(definition.knownKeys, raw);
  const output = parsed.output as Record<string, unknown>;
  return [
    ...unknown.map((key) => `unrecognized option "${key}"`),
    ...Object.entries(raw)
      .filter(([key, value]) => !unknown.includes(key) && degraded(value, output[key]))
      .map(([key]) => `option "${key}" is not understood and falls back to its default`),
  ];
}

describe("fenceProblems", () => {
  it("accepts options that survive the parse", () => {
    expect(fenceProblems(codeBlockDefinitions, "calendar-timeline", "mode: month\nbefore: 1")).toEqual([]);
  });

  it("flags a value the schema degrades to its default", () => {
    expect(fenceProblems(codeBlockDefinitions, "calendar-timeline", "mode: weekly")).toEqual([
      'option "mode" is not understood and falls back to its default',
    ]);
  });

  it("flags a list entry the schema drops", () => {
    expect(fenceProblems(codeBlockDefinitions, "journals-home", "show:\n  - day\n  - fortnight")).toEqual([
      'option "show" is not understood and falls back to its default',
    ]);
  });

  it("accepts a single name where a list is expected", () => {
    expect(fenceProblems(codeBlockDefinitions, "journal-notelets", "types: Meeting")).toEqual([]);
  });

  it("flags an unrecognized option", () => {
    expect(fenceProblems(codeBlockDefinitions, "calendar-timeline", "mood: month")).toEqual([
      'unrecognized option "mood"',
    ]);
  });

  it("flags YAML that does not parse", () => {
    expect(fenceProblems(codeBlockDefinitions, "calendar-timeline", "mode: [").at(0)).toMatch(/^YAML does not parse/);
  });

  it("flags a body that is not a mapping", () => {
    expect(fenceProblems(codeBlockDefinitions, "calendar-timeline", "mode:month")).toEqual([
      "body is not a mapping of options",
    ]);
  });

  it("flags a name that looks like a code block but is not registered", () => {
    expect(fenceProblems(codeBlockDefinitions, "journal-timeline", "")).toEqual([
      '"journal-timeline" is not a registered code block',
    ]);
  });

  it("ignores a fence in an unrelated language", () => {
    expect(fenceProblems(codeBlockDefinitions, "yaml", "mode: weekly")).toEqual([]);
  });
});

describe("the user manual", () => {
  const fences = markdownFiles(MANUAL).flatMap((file) =>
    fenceBlocks(readFileSync(file, "utf8")).map((fence) => ({ ...fence, file: path.relative(MANUAL, file) })),
  );

  it("documents only code-block options the plugin understands", () => {
    const problems = fences.flatMap((fence) =>
      fenceProblems(codeBlockDefinitions, fence.info, fence.body).map(
        (problem) => `${fence.file}:${fence.lineno} ${fence.info}: ${problem}`,
      ),
    );
    expect(problems).toEqual([]);
  });

  it("documents every registered code block", () => {
    const documented = new Set(fences.map((fence) => fence.info));
    const undocumented = codeBlockDefinitions
      .filter((definition) => definition.keys.every((key) => !documented.has(key)))
      .map((definition) => definition.keys[0]);
    expect(undocumented).toEqual([]);
  });
});
