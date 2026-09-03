import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "node:process";

import { browser } from "@wdio/globals";
import { parseObsidianVersions } from "wdio-obsidian-service";

const SCREENSHOT_DIR = "./e2e/.reports/screenshots";

// Version matrix is data-driven so CI jobs select it via OBSIDIAN_VERSIONS without
// editing this file: PR gate -> the pinned app version; nightly -> the floor + mismatch
// combos (see docs/e2e-testing-strategy.md). `earliest` resolves manifest.minAppVersion.
// Pinned rather than `latest/latest` for the same reason the CI matrix is: 1.13.8 is an
// Android-only release with no asar, and `latest` selects it. See .github/workflows/e2e.yml
// for the unpin condition; the two move together.
const versionSpec = env.OBSIDIAN_VERSIONS ?? "1.13.7/1.13.7";
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
    interop: ["./e2e/interop/**/*.e2e.ts"],
    journeys: ["./e2e/journeys/**/*.e2e.ts"],
    quarantine: ["./e2e/quarantine/**/*.e2e.ts"],
  },

  // One full Obsidian boot per worker; start single-process for determinism.
  maxInstances: 1,

  capabilities: versions.map(([appVersion, installerVersion]) => ({
    browserName: "obsidian",
    browserVersion: appVersion,
    "wdio:obsidianOptions": {
      installerVersion,
      // Templater is installed from the community registry but starts disabled; the
      // interop specs enable it per-boot via reloadObsidian so other suites are
      // unaffected. reloadObsidian can only enable plugins declared here. Pinned to
      // 2.18.0: it requires Obsidian >= 1.5.0, the newest Templater that still loads
      // across the whole matrix (our floor 1.8.7 .. latest stable). Templater 2.21+
      // require the 1.13 beta and silently stay unloaded on stable Obsidian.
      plugins: ["./build", { id: "templater-obsidian", version: "2.18.0", enabled: false }],
      vault: "./e2e/fixtures/e2e-empty",
    },
  })),

  services: ["obsidian"],

  // `obsidian` reporter wraps spec output with the Obsidian version; `junit` makes
  // retry/quarantine visibility a CI artifact.
  reporters: [
    "obsidian",
    // One report per spec file: getLogFile resolves this once per runner and `cid` is unique per
    // spec, so a fixed name would leave the whole suite's report holding only the last spec to
    // finish — which is why CI's junit check reported "1 tests run" beside a failed job.
    [
      "junit",
      { outputDir: "./e2e/.reports", outputFileFormat: ({ cid }: { cid: string }) => `e2e-junit-${cid}.xml` },
    ],
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
  },
};
