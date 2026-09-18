import * as v from "valibot";

import { createMultiToken } from "@/infrastructure/di";

import type { McpToolAnnotations } from "obsidian-local-rest-api";

/** One MCP tool offered on the Local REST API host. */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly input: v.ObjectEntries;
  readonly annotations: McpToolAnnotations;
  /** Receives arguments the host already validated against `input`; throws a coded error to fail. */
  call(arguments_: Record<string, unknown>): Promise<unknown>;
}

export const McpToolToken = createMultiToken<McpTool>("api.mcpTool");

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
