import { browser } from "@wdio/globals";

// `commands` is part of Obsidian's runtime but not its public typings (same shape
// as the smoke test's `plugins` cast).
export async function runCommand(commandId: string): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as { commands: { executeCommandById(id: string): boolean } };
    runtime.commands.executeCommandById(id);
  }, commandId);
}
