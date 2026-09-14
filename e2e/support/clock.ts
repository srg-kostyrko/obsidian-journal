import { browser } from "@wdio/globals";

class ClockPinError extends Error {
  constructor(expected: string, seen: unknown) {
    super(`expected the renderer to read ${expected} as today, got ${JSON.stringify(seen)}`);
    this.name = "ClockPinError";
  }
}

interface MomentTimeSource {
  now: () => number;
}

interface PinnedClockHost {
  e2eClockOffsetMs?: number;
  moment?: MomentTimeSource;
}

// Serialized into the page, so it stays self-contained. Only moment's time source moves — the
// plugin and Templater read "now" through moment — and `Date` stays real: Obsidian compares
// Date.now() against real file modification times and re-reads any config file that looks newer
// than its last save, so a shifted Date reverts live config changes such as the theme.
function installPinnedClock(localDateTime: string): void {
  const host = window as unknown as PinnedClockHost;
  host.e2eClockOffsetMs = new Date(localDateTime).getTime() - Date.now();
  const pin = (moment: MomentTimeSource): void => {
    moment.now = () => Date.now() + (host.e2eClockOffsetMs ?? 0);
  };
  if (host.moment !== undefined) {
    pin(host.moment);
    return;
  }
  // Obsidian loads moment as a UMD script that assigns window.moment, so pin it on assignment.
  let loaded: MomentTimeSource | undefined;
  Object.defineProperty(window, "moment", {
    configurable: true,
    get: () => loaded,
    set: (value: MomentTimeSource) => {
      loaded = value;
      pin(value);
    },
  });
}

// tsx compiles with keepNames, which can leave `__name(...)` calls in a stringified function body
// that the page has no helper for.
function pinScript(localDateTime: string): string {
  return `(() => { const __name = (fn) => fn; (${installPinnedClock.toString()})(${JSON.stringify(localDateTime)}); })();`;
}

async function assertRendererToday(day: string): Promise<void> {
  const seen = await browser.execute(() =>
    (window as unknown as { moment: () => { format(pattern: string): string } }).moment().format("YYYY-MM-DD"),
  );
  if (seen !== day) throw new ClockPinError(day, seen);
}

/** Move the live renderer's "now" to `localDateTime` (`YYYY-MM-DDTHH:mm:ss`); time keeps advancing. */
export async function pinClock(localDateTime: string): Promise<void> {
  await browser.execute(pinScript(localDateTime));
  await assertRendererToday(localDateTime.slice(0, 10));
}

/**
 * Boot `vault` with "now" already pinned when `plugins` load, so a boot-time read of today
 * (auto-create, the calendar's today) sees `day`. The vault first boots with no plugins, the pin is
 * registered to run ahead of every page script, and the app reloads with them enabled.
 */
export async function reloadObsidianOn(
  day: string,
  params: { vault: string; plugins: string[] },
  time = "12:00:00",
): Promise<void> {
  await browser.reloadObsidian({ vault: params.vault, plugins: [] });
  await browser.sendCommandAndGetResult("Page.addScriptToEvaluateOnNewDocument", {
    source: pinScript(`${day}T${time}`),
  });
  await browser.executeObsidian(async ({ app }, ids) => {
    // Enabled in config only: enablePlugin would load them now, on the real clock.
    const plugins = (app as unknown as { plugins: { enabledPlugins: Set<string>; saveConfig(): Promise<void> } })
      .plugins;
    for (const id of ids) plugins.enabledPlugins.add(id);
    await plugins.saveConfig();
  }, params.plugins);
  await browser.execute(() => {
    document.documentElement.dataset.e2eAwaitingReload = "true";
    window.location.reload();
  });
  await browser.waitUntil(
    () =>
      browser.execute(
        () => document.documentElement.dataset.e2eAwaitingReload === undefined && "wdioObsidianService" in window,
      ),
    { timeout: 60_000, interval: 100, timeoutMsg: "Obsidian did not come back from the pinned-clock reload" },
  );
  await browser.executeObsidian(({ app }) => new Promise<void>((resolve) => app.workspace.onLayoutReady(resolve)));
  const notLoaded = await browser.executeObsidian(
    ({ app }, ids) =>
      ids.filter((id) => !Object.hasOwn((app as unknown as { plugins: { plugins: object } }).plugins.plugins, id)),
    params.plugins,
  );
  if (notLoaded.length > 0) throw new ClockPinError(day, { pluginsNotLoaded: notLoaded });
  await assertRendererToday(day);
}
