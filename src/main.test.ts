import * as obsidian from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JournalsApi } from "@/api";
import { m } from "@/i18n";
import { Container, createToken, type Module } from "@/infrastructure/di";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";

import JournalPlugin from "./main";

import type { PluginManifest } from "obsidian";

const MANIFEST = { id: "journal", name: "Journal", author: "test", version: "3.0.0" } as unknown as PluginManifest;

function buildPlugin(): JournalPlugin {
  return new JournalPlugin(createFakeHost().app, MANIFEST);
}

const apiOrderingProbeToken = createToken<void>("main.test.api-ordering-probe");

// A module registered into main.ts's own container, not into a testContainer harness — main.ts
// builds its container internally with no seam to hand one in, so the only way to observe
// something happening *during* its `autoLoad()` is to splice a module in from outside at the
// moment `autoLoad()` runs, via the one call main.ts makes on the shared `Container` class.
function apiOrderingProbeModule(plugin: JournalPlugin, seen: (JournalsApi | undefined)[]): Module {
  return {
    register(c) {
      c.register(apiOrderingProbeToken)
        .useFactory(() => {
          seen.push(plugin.api);
        })
        .eager();
    },
  };
}

describe("JournalPlugin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the api before autoLoad runs, so an early consumer reads 'not ready' not 'not installed'", async () => {
    const plugin = buildPlugin();
    const seen: (JournalsApi | undefined)[] = [];
    const originalAutoLoad = Container.prototype.autoLoad;
    vi.spyOn(Container.prototype, "autoLoad").mockImplementation(function (this: Container) {
      this.addModule(apiOrderingProbeModule(plugin, seen));
      return originalAutoLoad.call(this);
    });

    await plugin.onload();

    expect(seen.at(0)).toBeDefined();
  });

  it("notices and disposes without initializing anything else when settings fail to load", async () => {
    const plugin = buildPlugin();
    vi.spyOn(plugin, "loadData").mockRejectedValue(new Error("data.json is not valid JSON"));
    const noticeSpy = vi.spyOn(obsidian, "Notice");
    const disposeSpy = vi.spyOn(Container.prototype, "dispose");
    const initializeSpy = vi.spyOn(VaultSubscriptionService.prototype, "initialize");

    await plugin.onload();

    expect(noticeSpy).toHaveBeenCalledWith(m.settings_load_failed({ error: "Failed to load plugin settings" }));
    expect(disposeSpy).toHaveBeenCalledOnce();
    expect(initializeSpy).not.toHaveBeenCalled();
    expect(plugin.api).toBeUndefined();
  });

  describe("onExternalSettingsChange", () => {
    it("returns early when the container is unset", () => {
      const plugin = buildPlugin();
      const noticeSpy = vi.spyOn(obsidian, "Notice");

      expect(() => plugin.onExternalSettingsChange()).not.toThrow();
      expect(noticeSpy).not.toHaveBeenCalled();
    });

    it("notices when a reload triggered after boot fails", async () => {
      const plugin = buildPlugin();
      await plugin.onload();
      vi.spyOn(plugin, "loadData").mockRejectedValueOnce(new Error("data.json vanished"));
      const noticeSpy = vi.spyOn(obsidian, "Notice");

      plugin.onExternalSettingsChange();

      await vi.waitFor(() => {
        expect(noticeSpy).toHaveBeenCalledWith(m.settings_reload_failed({ error: "Failed to load plugin settings" }));
      });
    });
  });

  it("clears the api and disposes the container on unload", async () => {
    const plugin = buildPlugin();
    await plugin.onload();
    expect(plugin.api).toBeDefined();
    const disposeSpy = vi.spyOn(Container.prototype, "dispose");

    plugin.onunload();

    expect(plugin.api).toBeUndefined();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  // The disposal-failure-swallow test lives in main.isolated.test.ts: it listens on the
  // process-global "unhandledRejection" event, which the shared, isolate:false unit-suite
  // project would let a floating rejection from another file in the same worker reach.
});
