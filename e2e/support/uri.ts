import { browser } from "@wdio/globals";

import { UriHandlerMissingError } from "./errors.js";

export type UriParams = Record<string, string>;

// Obsidian keeps obsidian:// handlers in app.workspace.protocolHandlers — a Map keyed by the
// action segment — and on a real link dispatches the parsed query as a flat param object to the
// matching handler. We invoke that registered handler directly: the same renderer-side entry
// point Obsidian itself calls, without the OS round trip the headless harness can't perform.
// Reaching an internal field mirrors commands.ts's executeCommandById cast. The handler is only
// present if the plugin's boot wiring registered it, so a missing handler is a real failure.
export async function openViaUri(params: UriParams): Promise<void> {
  const registered = await browser.executeObsidian(({ app }, query) => {
    const workspace = app.workspace as unknown as {
      protocolHandlers: Map<string, (data: Record<string, string>) => unknown>;
    };
    const handler = workspace.protocolHandlers.get("journals");
    if (handler === undefined) return false;
    handler({ action: "journals", ...query });
    return true;
  }, params);
  if (!registered) throw new UriHandlerMissingError();
}
