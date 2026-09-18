import { isRequired, type Prompt, type PromptAnswer } from "./config";
import { promptsInPath, type PromptOwner } from "./prompts-in-path";

export type UnattendedOutcome = { kind: "proceed" } | { kind: "refuse"; reason: "in-path" | "required" };

/**
 * The rule shared by auto-create and by an API caller passing prompt: false or answers. A prompt
 * in the path must refuse rather than proceed: the invariant forbids writing the placeholder into
 * a file name the plugin owns.
 */
export function unattendedOutcome(
  owner: PromptOwner,
  answers: Readonly<Record<string, PromptAnswer>> = {},
): UnattendedOutcome {
  const unanswered = (prompt: Prompt): boolean => !Object.hasOwn(answers, prompt.variable);
  if (promptsInPath(owner).some(unanswered)) return { kind: "refuse", reason: "in-path" };
  if (owner.prompts.some((prompt) => isRequired(prompt) && unanswered(prompt))) {
    return { kind: "refuse", reason: "required" };
  }
  return { kind: "proceed" };
}
