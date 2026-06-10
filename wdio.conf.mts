import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "node:process";

import { browser } from "@wdio/globals";
import { parseObsidianVersions } from "wdio-obsidian-service";

const SCREENSHOT_DIR = "./e2e/.reports/screenshots";

// Version matrix is data-driven so CI jobs select it via OBSIDIAN_VERSIONS without
// editing this file: PR gate -> "latest/latest"; nightly -> the floor + mismatch
// combos (see docs/e2e-testing-strategy.md). `earliest` resolves manifest.minAppVersion.
const versionSpec = env.OBSIDIAN_VERSIONS ?? "latest/latest";
const versions = await parseObsidianVersions(versionSpec);

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",

  // Suites are the grouping axis (see docs/e2e-testing-strategy.md). The PR gate
  // names the stable suites; nightly adds `quarantine`.
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
      plugins: ["./build"],
      vault: "./e2e/fixtures/empty",
    },
  })),

  services: ["obsidian"],

  // `obsidian` reporter wraps spec output with the Obsidian version; `junit` makes
  // retry/quarantine visibility a CI artifact.
  reporters: [
    "obsidian",
    ["junit", { outputDir: "./e2e/.reports", outputFileFormat: () => "e2e-junit.xml" }],
  ],

  cacheDir: path.resolve(".obsidian-cache"),

  logLevel: "warn",
  injectGlobals: false,

  // A flaky boot taints the whole spec file, so retry at file granularity, batched.
  specFileRetries: 1,
  specFileRetriesDeferred: true,

  waitforTimeout: 15_000,
  waitforInterval: 250,

  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
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
