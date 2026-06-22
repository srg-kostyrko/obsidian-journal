import { browser } from "@wdio/globals";

// app.plugins is runtime-only (not in Obsidian's public typings), cast like commands.ts does.
const PLUGIN_ID = "journals";

export function isPluginEnabled(): Promise<boolean> {
  return browser.executeObsidian(({ app }, id) => {
    // enabledPlugins.has() stays true even while the plugin is unloaded (disablePlugin does not
    // remove it). plugins.plugins[id] is the runtime instance: present when loaded, absent when
    // unloaded, so it reliably tracks the loaded/unloaded state across a disable/enable cycle.
    const runtime = app as unknown as { plugins: { plugins: Record<string, unknown> } };
    return Object.hasOwn(runtime.plugins.plugins, id);
  }, PLUGIN_ID);
}

export async function disablePlugin(): Promise<void> {
  await browser.executeObsidian(async ({ app }, id) => {
    const runtime = app as unknown as { plugins: { disablePlugin(id: string): Promise<void> } };
    await runtime.plugins.disablePlugin(id);
  }, PLUGIN_ID);
}

export async function enablePlugin(): Promise<void> {
  await browser.executeObsidian(async ({ app }, id) => {
    const runtime = app as unknown as { plugins: { enablePlugin(id: string): Promise<void> } };
    await runtime.plugins.enablePlugin(id);
  }, PLUGIN_ID);
}

// Invoke the plugin's own onExternalSettingsChange hook — the exact entry point Obsidian Sync
// calls when data.json changes on disk. Drives SettingsService.reload() without a real Sync round trip.
export async function triggerExternalSettingsChange(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as {
      plugins: { plugins: Record<string, { onExternalSettingsChange?: () => void }> };
    };
    runtime.plugins.plugins[id]?.onExternalSettingsChange?.();
  }, PLUGIN_ID);
}
