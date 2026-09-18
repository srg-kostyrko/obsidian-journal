import * as v from "valibot";

import { createMultiToken } from "@/infrastructure/di";

import { readErrorCode } from "./errors";

import type { McpToolAnnotations } from "obsidian-local-rest-api";

/** One MCP tool offered on the Local REST API host. */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly input: v.ObjectEntries;
  // The MCP spec defaults destructiveHint and openWorldHint to true, so a hint left out reads as the
  // worst case to a client.
  readonly annotations: Required<Omit<McpToolAnnotations, "title">> & Pick<McpToolAnnotations, "title">;
  /** Receives arguments the host already validated against `input`; throws a coded error to fail. */
  call(arguments_: Record<string, unknown>): Promise<unknown>;
}

export const McpToolToken = createMultiToken<McpTool>("api.mcpTool");

/** Carries a tool call's JSON error body as its message — the host turns it into tool-error text. */
export class McpToolError extends Error {}

export const journalEntry = v.pipe(v.string(), v.description("The journal's name, as journal_list reports it."));
export const dateEntry = v.pipe(
  v.string(),
  v.description('A day: "today", "YYYY-MM-DD", or a shift such as "+1w" or "-1d".'),
);
export const answersEntry = v.optional(
  v.pipe(
    v.record(v.string(), v.unknown()),
    v.description(
      "Answers to the journal's questions, keyed by each question's variable (journal_list lists them). A date answer is YYYY-MM-DD; a note answer is an existing vault path.",
    ),
  ),
);

// The API's prompts-required message is written for a person at a prompt; an agent needs to be told
// which argument carries the answers. Spreading keeps code, journal and whatever else the error
// carries — Error#message is non-enumerable, so only the replacement below lands.
function forAgent(error: unknown): unknown {
  if (readErrorCode(error) !== "prompts-required") return error;
  return {
    ...(error as Record<string, unknown>),
    message:
      "This journal asks questions before it creates a note. Call again with answers, an object keyed by each question's variable; journal_list lists each journal's questions.",
  };
}

/** Awaits a note-creating call, rewording a prompts-required rejection for an agent. */
export async function creatingForAgent<T>(creation: Promise<T>): Promise<T> {
  try {
    return await creation;
  } catch (error) {
    throw forAgent(error);
  }
}
