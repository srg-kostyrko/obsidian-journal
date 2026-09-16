import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "node:process";

import { browser } from "@wdio/globals";
import ObsidianLauncher from "obsidian-launcher";
import { parseObsidianVersions } from "wdio-obsidian-service";

// Mirrors wdio-obsidian-service's own default; it resolves this against the project root too.
const CACHE_DIR = env.WEBDRIVER_CACHE_DIR ?? env.OBSIDIAN_CACHE ?? "./.obsidian-cache";

const SCREENSHOT_DIR = "./e2e/.reports/screenshots";
const LOG_DIR = "./e2e/.reports/logs";

// Two streams, merged by timestamp into one ordered story. The plugin's own records come from
// its in-memory buffer (fields intact; e2e fixtures run it at "debug"), and the renderer console
// carries what the buffer cannot see — Obsidian's own errors, an uncaught exception, and the
// harness markers that say when a spec touched the vault. Chromedriver holds console entries for
// the life of the session, so a spec that reboots in `before` still gets its whole boot trail:
// the one window a failing first test cannot otherwise show.
interface ConsoleEntry {
  level: string;
  message: string;
  timestamp: number;
}

function isConsoleEntry(value: unknown): value is ConsoleEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.level === "string" && typeof entry.message === "string";
}

// The plugin's console sink echoes every record the buffer already holds, and the wire renders
// its fields as the bare word "Object". Keeping both would print each line twice, the second
// time with the values stripped — so the console contributes only what the buffer cannot see.
function isPluginEcho(entry: ConsoleEntry): boolean {
  return entry.message.includes('"[journals');
}

function at(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

// The plugin's own records, read off its in-memory buffer rather than the console: console
// entries travel as rendered *arguments*, so a record's fields arrive as the bare word "Object"
// and the path or id that makes the line worth reading is gone. Typed here rather than imported
// from src because it crosses the WebDriver wire as plain JSON. Only what the configured level
// let through — e2e fixtures run at "debug" — and only the current boot, since the buffer lives
// with the plugin instance.
interface PluginLogRecord {
  timestamp: number;
  level: string;
  name: string;
  message: string;
  fields?: Record<string, unknown>;
}

function readPluginLog(): Promise<PluginLogRecord[]> {
  return browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as {
      plugins: { plugins: Record<string, { logSnapshot?: () => PluginLogRecord[] }> };
    };
    return runtime.plugins.plugins[id]?.logSnapshot?.() ?? [];
  }, "journals");
}

function pluginLine(record: PluginLogRecord): string {
  const name = record.name === "" ? "journals" : `journals:${record.name}`;
  const fields = record.fields === undefined ? "" : ` ${JSON.stringify(record.fields)}`;
  return `${at(record.timestamp)} [${record.level}] [${name}] ${record.message}${fields}`;
}

// Version matrix is data-driven so CI jobs select it via OBSIDIAN_VERSIONS without
// editing this file: PR gate -> "latest/latest"; nightly -> the floor + mismatch
// combos (see docs/e2e-testing-strategy.md). `earliest` resolves manifest.minAppVersion.
const versionSpec = env.OBSIDIAN_VERSIONS ?? "latest/latest";
const versions = await parseObsidianVersions(versionSpec);

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",

  // Suites are the grouping axis (see docs/e2e-testing-strategy.md). Every CI run names
  // its suites; nightly names `quarantine` too. The bare glob is a local-run convenience.
  specs: ["./e2e/**/*.e2e.ts"],
  suites: {
    smoke: ["./e2e/smoke/**/*.e2e.ts"],
    integration: ["./e2e/integration/**/*.e2e.ts"],
    migration: ["./e2e/migration/**/*.e2e.ts"],
    // interop-1x holds the specs that need Periodic Notes 1.x, which can only run under its own
    // capability: both versions share the plugin id "periodic-notes".
    interop: ["./e2e/interop/**/*.e2e.ts", "./e2e/interop-1x/**/*.e2e.ts"],
    journeys: ["./e2e/journeys/**/*.e2e.ts"],
    quarantine: ["./e2e/quarantine/**/*.e2e.ts"],
    // Documentation screenshots. No CI job names this suite and the bare glob above matches only
    // *.e2e.ts, so no ordinary run rewrites a committed image.
    screenshots: ["./e2e/screenshots/**/*.shot.ts"],
  },

  // One full Obsidian boot per worker; start single-process for determinism.
  maxInstances: 1,

  capabilities: versions.flatMap(([appVersion, installerVersion]) => [
    {
      browserName: "obsidian",
      browserVersion: appVersion,
      "goog:loggingPrefs": { browser: "ALL" },
      // Directory excludes, not a spec list: WDIO replaces a capability's `wdio:specs` whenever a
      // suite is named, and every CI run names suites. `wdio:exclude` is honoured either way.
      "wdio:exclude": ["./e2e/interop-1x/**"],
      "wdio:obsidianOptions": {
        installerVersion,
        // Templater is installed from the community registry but starts disabled; the
        // interop specs enable it per-boot via reloadObsidian so other suites are
        // unaffected. reloadObsidian can only enable plugins declared here. Pinned to
        // 2.18.0: it requires Obsidian >= 1.5.0, the newest Templater that still loads
        // across the whole matrix (our floor 1.8.7 .. latest stable). Templater 2.21+
        // require the 1.13 beta and silently stay unloaded on stable Obsidian.
        // Periodic Notes 0.0.17 and Calendar 1.5.10 are the community-store versions the import reads.
        plugins: [
          "./build",
          { id: "templater-obsidian", version: "2.18.0", enabled: false },
          { id: "periodic-notes", version: "0.0.17", enabled: false },
          { id: "calendar", version: "1.5.10", enabled: false },
        ],
        vault: "./e2e/fixtures/e2e-empty",
      },
    },
    {
      browserName: "obsidian",
      browserVersion: appVersion,
      "goog:loggingPrefs": { browser: "ALL" },
      "wdio:exclude": [
        "./e2e/smoke/**",
        "./e2e/integration/**",
        "./e2e/migration/**",
        "./e2e/interop/**",
        "./e2e/journeys/**",
        "./e2e/quarantine/**",
        "./e2e/screenshots/**",
      ],
      "wdio:obsidianOptions": {
        installerVersion,
        // Pinned by version: "latest" resolves through the repo's HEAD manifest, which still says
        // 0.0.17 even at the beta tags.
        plugins: ["./build", { repo: "liamcain/obsidian-periodic-notes", version: "1.0.0-beta.3", enabled: false }],
        vault: "./e2e/fixtures/e2e-empty",
      },
    },
  ]),

  services: ["obsidian"],

  // `obsidian` reporter wraps spec output with the Obsidian version; `junit` makes
  // retry/quarantine visibility a CI artifact.
  reporters: [
    "obsidian",
    // One report per spec file: getLogFile resolves this once per runner and `cid` is unique per
    // spec, so a fixed name would leave the whole suite's report holding only the last spec to
    // finish — which is why CI's junit check reported "1 tests run" beside a failed job.
    ["junit", { outputDir: "./e2e/.reports", outputFileFormat: ({ cid }: { cid: string }) => `e2e-junit-${cid}.xml` }],
  ],

  cacheDir: path.resolve(".obsidian-cache"),

  logLevel: "warn",
  injectGlobals: false,

  waitforTimeout: 15_000,
  waitforInterval: 250,

  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  // The service downloads every declared plugin with one `Promise.all`, and each community-store
  // (`id:`) entry independently fetches the shared community-plugins registry. `cachedFetch` only
  // populates its in-memory cache once a download has finished, so with more than one such entry
  // they all miss, all fetch, and all rename their temp copy onto the same cache file. POSIX
  // rename-over-existing is atomic and the losers are harmless; on Windows a rename onto a path
  // another handle holds open is EPERM, and it surfaces as a fatal SevereServiceError out of the
  // service's own onPrepare -- a red shard with no junit and no screenshots. Fetching once here
  // leaves the file fresh inside the launcher's 30-minute cache window, so the fan-out reads it
  // instead of racing to write it. wdio awaits this hook before any service's onPrepare, and the
  // handoff is the cache file on disk: the service builds a private launcher we cannot reach, so
  // sharing its in-memory cache is not an option.
  onPrepare: async function () {
    await new ObsidianLauncher({ cacheDir: CACHE_DIR }).getCommunityPlugins();
  },

  // Obsidian renders menus two ways, and only one of them is a DOM node: `nativeMenus`
  // defaults on for macOS, and the native path hands the items to Electron, leaving nothing
  // for `.menu-item-title` to find. Left alone, every menu assertion in the suite passes on
  // Linux and Windows and fails on macOS as "menu did not open" — a platform accident, not a
  // finding. Pin the DOM rendering so menu specs mean the same thing on every OS; a spec that
  // wants the native path opts into it explicitly with e2e/support/native-menu.ts, which
  // reproduces it on all three. Re-applied per test because reloadObsidian resets the static.
  beforeTest: async function () {
    await browser.executeObsidian(({ obsidian }) => {
      (obsidian as unknown as { Menu: { useNativeMenu: unknown } }).Menu.useNativeMenu = false;
    });
  },

  // Headless CI failures are near-impossible to debug without a capture (see
  // docs/e2e-testing-strategy.md, Authoring conventions). Saved as a junit-sibling
  // artifact under e2e/.reports.
  afterTest: async function (test, _context, result: { passed: boolean }) {
    if (result.passed) return;
    const screenshot = await browser.takeScreenshot();
    const name = `${test.parent} ${test.title}`.replaceAll(/[^\w]+/g, "-").toLowerCase();
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await writeFile(path.join(SCREENSHOT_DIR, `${name}.png`), screenshot, "base64");

    // A screenshot shows a surface that never changed; it cannot show why. The trail can, so it
    // ships beside it — and also goes to stdout, because the job log is what a triager reads
    // first and downloading an artifact is a second trip.
    let records: PluginLogRecord[] = [];
    let consoleEntries: unknown[] = [];
    try {
      records = await readPluginLog();
      consoleEntries = await browser.getLogs("browser");
    } catch {
      // A wedged renderer loses the session before the hook runs; whatever was collected still ships.
    }
    const lines = [
      ...records.map((record) => [record.timestamp, pluginLine(record)] as const),
      ...consoleEntries
        .filter(isConsoleEntry)
        .filter((entry) => !isPluginEcho(entry))
        .map((entry) => [entry.timestamp, `${at(entry.timestamp)} [${entry.level}] ${entry.message}`] as const),
    ]
      .toSorted(([a], [b]) => a - b)
      .map(([, line]) => line);
    if (lines.length === 0) return;
    await mkdir(LOG_DIR, { recursive: true });
    await writeFile(path.join(LOG_DIR, `${name}.log`), `${lines.join("\n")}\n`);
    // The merged story, not just the plugin's half: the harness markers say when the spec touched
    // the vault, and a boot-window failure is only legible as "the create landed before the
    // subscriber did" when both halves sit on one timeline. Printing the plugin log alone left
    // that ordering readable only in the artifact, which is the second trip this copy exists to
    // spare.
    console.log([`--- journals log: ${test.title} ---`, ...lines].join("\n"));
  },
};
