import { variableNames } from "@/templates";

import type { Prompt } from "./config";

export interface PromptOwner {
  readonly nameTemplate: string;
  readonly folder: string;
  readonly prompts: readonly Prompt[];
}

/**
 * The owner's prompts whose answers reach its note name or folder.
 *
 * Case-insensitive because `TemplateContext.#lookup` falls back to a case-insensitive match,
 * so `{{Mood}}` binds a prompt named `mood`. A case-sensitive test here would silently miss it
 * and every rule keyed on this predicate would then decide the wrong way.
 */
export function promptsInPath(owner: PromptOwner): readonly Prompt[] {
  const used = new Set(
    [...variableNames(owner.nameTemplate), ...variableNames(owner.folder)].map((name) => name.toLowerCase()),
  );
  return owner.prompts.filter((prompt) => used.has(prompt.variable.toLowerCase()));
}

/**
 * The prompts whose answers reach one specific template (the name OR the folder, not both).
 *
 * `promptsInPath` unions both halves, which is right for "is this owner unattended-safe at
 * all" but wrong for a caller that can honor one half of a path while refusing the other —
 * a rename and a move touch different templates, so each needs its own refusal check.
 */
export function promptsInTemplate(template: string, prompts: readonly Prompt[]): readonly Prompt[] {
  const used = new Set([...variableNames(template)].map((name) => name.toLowerCase()));
  return prompts.filter((prompt) => used.has(prompt.variable.toLowerCase()));
}
