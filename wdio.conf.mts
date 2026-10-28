import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, platform } from "node:process";

import { browser } from "@wdio/globals";
import { parseObsidianVersions } from "wdio-obsidian-service";

const CACHE_DIR = path.resolve(".obsidian-cache");

const REPORTS_DIR = "./e2e-tests/.reports";
const SCREENSHOT_DIR = `${REPORTS_DIR}/screenshots`;
const LOG_DIR = `${REPORTS_DIR}/logs`;

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

// Obsidian's reading view renders on the next animation frame, and a ResizeObserver reports
// only on one, so a window that has stopped producing frames reads as "never rendered" until
// something forces a frame — a screenshot does. This records whether frames were flowing at the
// moment of failure, and why Chromium might have stopped them.
interface FrameState {
  visibilityState: string;
  hasFocus: boolean;
  // ms until a requestAnimationFrame callback ran; null if none ran within the probe window.
  frameWithinMs: number | null;
}

async function readFrameState(): Promise<FrameState> {
  // W3C executeScript awaits a returned promise; the typings model it as nested, hence the await.
  return await browser.execute(async () => {
    const frameWithinMs = await new Promise<number | null>((resolve) => {
      const start = performance.now();
      const timer = setTimeout(() => {
        resolve(null);
      }, 1000);
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve(Math.round(performance.now() - start));
      });
    });
    return { visibilityState: document.visibilityState, hasFocus: document.hasFocus(), frameWithinMs };
  });
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

// Workers per run, each one a full Obsidian boot. Two, settled by measurement rather than by core
// count: across 13 runs the gate leg's median fell from 596s to 475s, and 16 runs at this value
// found ten tests whose waits only held because the runner was fast. Three is untested here and
// the ceiling is the narrowest runner in the matrix (macOS, 3 vCPU), not the service, which
// sandboxes every session. Env-driven so a workflow_dispatch can sweep it without editing this
// file. Raising it needs the same evidence: repeat runs, and every failure triaged as a bug.
// Empty is treated as unset, which `??` alone would not do: a workflow `env:` whose expression
// yields "" still sets the variable, and so does a bare `E2E_MAX_INSTANCES=` in a shell. Anything
// else — including "0" — reaches the guard, so a typo fails the run instead of silently choosing
// a worker count nobody asked for.
const rawMaxInstances = env.E2E_MAX_INSTANCES?.trim() ?? "";
const maxInstances = rawMaxInstances === "" ? 2 : Number(rawMaxInstances);
if (!Number.isSafeInteger(maxInstances) || maxInstances < 1) {
  throw new TypeError(`E2E_MAX_INSTANCES must be a positive integer; got ${JSON.stringify(env.E2E_MAX_INSTANCES)}`);
}

// A renderer that dies takes the page's console and the plugin's log with it, so only the browser
// process can say whether it crashed, hung, or lost its GPU process. Chromium truncates the file at
// each launch, so it holds the last Obsidian boot of the run — enough for a failure that repeats on
// every boot, which is the kind that needs it. Chromium will not create the directory, hence onPrepare.
const CHROMIUM_LOG = path.resolve(REPORTS_DIR, "chromium.log");
const CHROMIUM_LOG_ARGS = ["--enable-logging", `--log-file=${CHROMIUM_LOG}`];

// Installer 1.5.8 (Electron 28, Chrome 120) is Obsidian's own minimum installer, so the floor legs run
// on it. On the windows-2025 runner image from 20261018 (OS build 26100.33650; 33438 was fine) its
// sandboxed GPU process dies with 0xC0000005 at every launch; Chromium falls back through each GPU
// mode, finds none left, and crashes the browser on purpose
// (IntentionallyCrashBrowserForUnusableGpuProcess) — which chromedriver reports as a lost renderer.
// --disable-gpu does not help: software compositing still runs in that process, and starting lower
// in the fallback chain only exhausts it sooner. Without the sandbox the process does not crash. The test
// Obsidian opens only fixture vaults, and newer installers are unaffected either way.
const GPU_ARGS = platform === "win32" ? ["--disable-gpu-sandbox"] : [];

// CI runs Linux under one bare Xvfb display with no window manager, so every worker's window opens
// at the same origin and the newest boot covers the other. Chromium's X11 window takes the
// FullyObscured VisibilityNotify as occlusion and backgrounds the page: visibilityState "hidden",
// no animation frames, no ResizeObserver delivery — the "frames at failure: hidden, null" stall.
// Measured under xvfb-run with installers 1.5.8 and 1.14.5: the covered window reads hidden with no
// rAF, and with this switch it stays visible and keeps rendering. --disable-renderer-backgrounding
// changes nothing there.
const OCCLUSION_ARGS = platform === "linux" ? ["--disable-backgrounding-occluded-windows"] : [];

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",

  // Suites are the grouping axis (see docs/e2e-testing-strategy.md). Every CI run names
  // its suites; nightly names `quarantine` too. The bare glob is a local-run convenience.
  specs: ["./e2e-tests/**/*.e2e.ts"],
  suites: {
    smoke: ["./e2e-tests/smoke/**/*.e2e.ts"],
    integration: ["./e2e-tests/integration/**/*.e2e.ts"],
    migration: ["./e2e-tests/migration/**/*.e2e.ts"],
    // interop-1x holds the specs that need Periodic Notes 1.x, which can only run under its own
    // capability: both versions share the plugin id "periodic-notes".
    interop: ["./e2e-tests/interop/**/*.e2e.ts", "./e2e-tests/interop-1x/**/*.e2e.ts"],
    journeys: ["./e2e-tests/journeys/**/*.e2e.ts"],
    quarantine: ["./e2e-tests/quarantine/**/*.e2e.ts"],
    // Documentation screenshots. No CI job names this suite and the bare glob above matches only
    // *.e2e.ts, so no ordinary run rewrites a committed image.
    screenshots: ["./e2e-tests/screenshots/**/*.shot.ts"],
  },

  maxInstances,

  capabilities: versions.flatMap(([appVersion, installerVersion]) => [
    {
      browserName: "obsidian",
      browserVersion: appVersion,
      "goog:loggingPrefs": { browser: "ALL" },
      "goog:chromeOptions": { args: [...CHROMIUM_LOG_ARGS, ...GPU_ARGS, ...OCCLUSION_ARGS] },
      // Directory excludes, not a spec list: WDIO replaces a capability's `wdio:specs` whenever a
      // suite is named, and every CI run names suites. `wdio:exclude` is honoured either way.
      "wdio:exclude": ["./e2e-tests/interop-1x/**"],
      "wdio:obsidianOptions": {
        installerVersion,
        // Templater is installed from the community registry but starts disabled; the
        // interop specs enable it per-boot via reloadObsidian so other suites are
        // unaffected. reloadObsidian can only enable plugins declared here. Pinned to
        // 2.18.0: it requires Obsidian >= 1.5.0, the newest Templater that still loads
        // across the whole matrix (our floor 1.8.7 .. latest stable). Templater 2.21+
        // silently stay unloaded on stable Obsidian; not because of their 1.13.0
        // minAppVersion, which loading never reads (see Local REST API below).
        // Periodic Notes 0.0.17 and Calendar 1.5.10 are the community-store versions the import reads.
        // Local REST API 5.1.0 declares minAppVersion 1.13.1, but Obsidian reads minAppVersion only
        // in the community browser's version picker, never when loading a plugin (app.js, 1.8.7
        // and 1.13.7): installed this way it loads and passes its spec on the 1.8.7 floor too
        // (measured), and its spec fails outright if getPlugin() ever comes back null.
        // TaskNotes 4.13.9 likewise declares 1.12.2 and loads on 1.8.7 (measured); its spec asserts
        // getPlugin() first for the same reason.
        plugins: [
          "./build",
          { id: "templater-obsidian", version: "2.18.0", enabled: false },
          { id: "periodic-notes", version: "0.0.17", enabled: false },
          { id: "calendar", version: "1.5.10", enabled: false },
          { id: "obsidian-local-rest-api", version: "5.1.0", enabled: false },
          { id: "tasknotes", version: "4.13.9", enabled: false },
        ],
        vault: "./e2e-tests/fixtures/e2e-empty",
      },
    },
    {
      browserName: "obsidian",
      browserVersion: appVersion,
      "goog:loggingPrefs": { browser: "ALL" },
      "goog:chromeOptions": { args: [...CHROMIUM_LOG_ARGS, ...GPU_ARGS, ...OCCLUSION_ARGS] },
      "wdio:exclude": [
        "./e2e-tests/smoke/**",
        "./e2e-tests/integration/**",
        "./e2e-tests/migration/**",
        "./e2e-tests/interop/**",
        "./e2e-tests/journeys/**",
        "./e2e-tests/quarantine/**",
        "./e2e-tests/screenshots/**",
      ],
      "wdio:obsidianOptions": {
        installerVersion,
        // Pinned by version: "latest" resolves through the repo's HEAD manifest, which still says
        // 0.0.17 even at the beta tags.
        plugins: ["./build", { repo: "liamcain/obsidian-periodic-notes", version: "1.0.0-beta.3", enabled: false }],
        vault: "./e2e-tests/fixtures/e2e-empty",
      },
    },
  ]),

  services: ["obsidian"],

  onPrepare: async function () {
    await mkdir(REPORTS_DIR, { recursive: true });
  },

  // `obsidian` reporter wraps spec output with the Obsidian version; `junit` makes
  // retry/quarantine visibility a CI artifact.
  reporters: [
    "obsidian",
    // One report per spec file: getLogFile resolves this once per runner and `cid` is unique per
    // spec, so a fixed name would leave the whole suite's report holding only the last spec to
    // finish — which is why CI's junit check reported "1 tests run" beside a failed job.
    [
      "junit",
      { outputDir: "./e2e-tests/.reports", outputFileFormat: ({ cid }: { cid: string }) => `e2e-junit-${cid}.xml` },
    ],
  ],

  cacheDir: CACHE_DIR,

  logLevel: "warn",
  injectGlobals: false,

  waitforTimeout: 15_000,
  waitforInterval: 250,

  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  // Obsidian renders menus two ways, and only one of them is a DOM node: `nativeMenus`
  // defaults on for macOS, and the native path hands the items to Electron, leaving nothing
  // for `.menu-item-title` to find. Left alone, every menu assertion in the suite passes on
  // Linux and Windows and fails on macOS as "menu did not open" — a platform accident, not a
  // finding. Pin the DOM rendering so menu specs mean the same thing on every OS; a spec that
  // wants the native path opts into it explicitly with e2e-tests/support/native-menu.ts, which
  // reproduces it on all three. Re-applied per test because reloadObsidian resets the static.
  beforeTest: async function () {
    await browser.executeObsidian(({ obsidian }) => {
      (obsidian as unknown as { Menu: { useNativeMenu: unknown } }).Menu.useNativeMenu = false;
    });
  },

  // Headless CI failures are near-impossible to debug without a capture (see
  // docs/e2e-testing-strategy.md, Authoring conventions). Saved as a junit-sibling
  // artifact under e2e-tests/.reports.
  afterTest: async function (test, _context, result: { passed: boolean }) {
    if (result.passed) return;
    // Before the screenshot, which forces the very frame this probe is looking for.
    let frameState: FrameState | null = null;
    try {
      frameState = await readFrameState();
    } catch {
      // A wedged renderer cannot answer; the null says so.
    }
    const name = `${test.parent} ${test.title}`.replaceAll(/[^\w]+/g, "-").toLowerCase();
    try {
      const screenshot = await browser.takeScreenshot();
      await mkdir(SCREENSHOT_DIR, { recursive: true });
      await writeFile(path.join(SCREENSHOT_DIR, `${name}.png`), screenshot, "base64");
    } catch {
      // A lost renderer cannot be captured, and throwing here would drop the trail below too —
      // which is the only record of why it was lost.
    }

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
    const trail = [
      ...records.map((record) => [record.timestamp, pluginLine(record)] as const),
      ...consoleEntries
        .filter(isConsoleEntry)
        .filter((entry) => !isPluginEcho(entry))
        .map((entry) => [entry.timestamp, `${at(entry.timestamp)} [${entry.level}] ${entry.message}`] as const),
    ]
      .toSorted(([a], [b]) => a - b)
      .map(([, line]) => line);
    const lines = [
      `frames at failure: ${frameState === null ? "renderer did not answer" : JSON.stringify(frameState)}`,
      ...trail,
    ];
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
