import { isRequired } from "./config";
import { promptsInPath, type PromptOwner } from "./prompts-in-path";

export type UnattendedOutcome = { kind: "proceed" } | { kind: "refuse"; reason: "in-path" | "required" };

/**
 * The rule shared by auto-create and by an API caller passing prompt: false. A prompt in the
 * path must refuse rather than proceed: the invariant forbids writing the placeholder into a
 * file name the plugin owns.
 */
export function unattendedOutcome(owner: PromptOwner): UnattendedOutcome {
  if (promptsInPath(owner).length > 0) return { kind: "refuse", reason: "in-path" };
  if (owner.prompts.some(isRequired)) return { kind: "refuse", reason: "required" };
  return { kind: "proceed" };
}
