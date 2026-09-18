import { LOCAL_REST_API_PLUGIN_ID } from "obsidian-local-rest-api";
import { describe, expect, it, vi } from "vitest";

import { LogLevelGateToken } from "@/infrastructure/logger";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { apiModule } from "../module";

import { LocalRestApiBridge } from "./local-rest-api-bridge";
import { recordingLocalRestApi } from "./testing";

import type { IRoute } from "express";

const HOST_LOADED_EVENT = "obsidian-local-rest-api:loaded";

function chainableRoute(): IRoute {
  const route: Record<string, unknown> = {};
  for (const method of ["get", "post", "put", "patch", "delete"]) route[method] = vi.fn(() => route);
  return route as unknown as IRoute;
}

function fakeLocalRestApi() {
  return {
    apiVersion: 2,
    addRoute: vi.fn(() => chainableRoute()),
    addPublicRoute: vi.fn(),
    addMcpTool:
      vi.fn<
        (
          name: string,
          description: string,
          schema: Record<string, unknown>,
          callback: (arguments_: Record<string, unknown>) => Promise<unknown>,
          annotations: unknown,
        ) => void
      >(),
    unregister: vi.fn(),
  };
}

function buildHarness(): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals: {}, shelves: {} },
  });
}

describe("LocalRestApiBridge", () => {
  it("registers nothing and does not throw when no host is installed", async () => {
    const harness = await buildHarness();
    const bridge = harness.resolve(LocalRestApiBridge);

    expect(() => bridge.initialize()).not.toThrow();
  });

  it("registers journal routes when the host is already installed", async () => {
    const harness = await buildHarness();
    const api = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    const bridge = harness.resolve(LocalRestApiBridge);

    bridge.initialize();

    expect(api.addRoute).toHaveBeenCalled();
  });

  it("unregisters the previous handle before registering again when the host reloads", async () => {
    const harness = await buildHarness();
    const first = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => first });
    const bridge = harness.resolve(LocalRestApiBridge);
    bridge.initialize();

    const second = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => second });
    harness.host.emitWorkspace(HOST_LOADED_EVENT);

    expect(first.unregister).toHaveBeenCalled();
    expect(second.addRoute).toHaveBeenCalled();
    expect(first.unregister.mock.invocationCallOrder[0]).toBeLessThan(second.addRoute.mock.invocationCallOrder[0]);
  });

  it("releases the handle when registration throws partway through", async () => {
    const harness = await buildHarness();
    // addRoute itself succeeds (so the handle is already held), and the throw comes from the verb
    // chained onto the first route, the same shape a host-side route collision would take.
    const throwingRoute = {
      get: vi.fn(() => {
        throw new Error("route collides with one the host already owns");
      }),
    } as unknown as IRoute;
    const api = {
      apiVersion: 2,
      addRoute: vi.fn(() => throwingRoute),
      addPublicRoute: vi.fn(),
      addMcpTool: vi.fn(),
      unregister: vi.fn(),
    };
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    const bridge = harness.resolve(LocalRestApiBridge);

    expect(() => bridge.initialize()).not.toThrow();

    expect(api.addRoute).toHaveBeenCalled();
    expect(api.unregister).toHaveBeenCalledTimes(1);
  });

  it("registers journal routes once the host installs after initialize", async () => {
    const harness = await buildHarness();
    const bridge = harness.resolve(LocalRestApiBridge);
    bridge.initialize();

    const api = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    harness.host.emitWorkspace(HOST_LOADED_EVENT);

    expect(api.addRoute).toHaveBeenCalled();
  });

  it("unregisters the active handle on dispose", async () => {
    const harness = await buildHarness();
    const api = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    const bridge = harness.resolve(LocalRestApiBridge);
    bridge.initialize();

    bridge[Symbol.dispose]();

    expect(api.unregister).toHaveBeenCalled();
  });

  it("logs at debug and registers nothing when the host's getAPI throws", async () => {
    const harness = await buildHarness();
    harness.resolve(LogLevelGateToken).setThreshold("debug");
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, {
      getPublicApi: () => {
        throw new Error("boom");
      },
    });
    const bridge = harness.resolve(LocalRestApiBridge);

    expect(() => bridge.initialize()).not.toThrow();

    expect(harness.logs.records).toContainEqual(
      expect.objectContaining({
        level: "debug",
        name: "local-rest-api",
        message: "local rest api registration failed",
      }),
    );
  });
});

describe("LocalRestApiBridge route registration", () => {
  it("registers the notes and notelets routes before any :name/:date route", async () => {
    const harness = await buildHarness();
    const host = recordingLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => host.api });

    harness.resolve(LocalRestApiBridge).initialize();

    expect(host.api.addRoute.mock.calls.map(([path]) => path)).toEqual([
      "/journals/",
      "/journals/:name/",
      "/journals/:name/notes",
      "/journals/:name/notes/:date",
      "/journals/:name/notelets/:date",
      "/journals/:name/:date",
      "/journals/:name/:date/*",
    ]);
  });

  it("registers the redirect family for both the plain and the wildcard path", async () => {
    const harness = await buildHarness();
    const host = recordingLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => host.api });

    harness.resolve(LocalRestApiBridge).initialize();

    for (const path of ["/journals/:name/:date", "/journals/:name/:date/*"]) {
      for (const method of ["get", "post", "put", "patch", "delete"]) {
        expect(host.handlers.has(`${method} ${path}`)).toBe(true);
      }
    }
  });
});

describe("LocalRestApiBridge tool registration", () => {
  it("registers every journal tool on a host that implements API version 2", async () => {
    const harness = await buildHarness();
    const api = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    harness.resolve(LocalRestApiBridge).initialize();

    expect(api.addMcpTool.mock.calls.map(([name]) => name)).toEqual([
      "journal_list",
      "journal_notes",
      "journal_note_ensure",
      "journal_notelet_create",
    ]);
  });

  it("registers routes but no tools on a host older than API version 2", async () => {
    const harness = await buildHarness();
    const { apiVersion: _dropped, ...api } = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => ({ ...api, apiVersion: 1 }) });
    harness.resolve(LocalRestApiBridge).initialize();

    expect(api.addRoute).toHaveBeenCalled();
    expect(api.addMcpTool).not.toHaveBeenCalled();
  });

  it("registers routes but no tools on a host that predates the apiVersion field", async () => {
    const harness = await buildHarness();
    const { apiVersion: _dropped, ...api } = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    harness.resolve(LocalRestApiBridge).initialize();

    expect(api.addRoute).toHaveBeenCalled();
    expect(api.addMcpTool).not.toHaveBeenCalled();
  });
});
