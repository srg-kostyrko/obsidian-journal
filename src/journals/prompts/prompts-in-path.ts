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
