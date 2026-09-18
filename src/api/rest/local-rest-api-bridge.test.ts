import { LOCAL_REST_API_PLUGIN_ID } from "obsidian-local-rest-api";
import { describe, expect, it, vi } from "vitest";

import { LogLevelGateToken } from "@/infrastructure/logger";
import { journalsCoreModule } from "@/journals/module";
import { NoteCreationService } from "@/journals/notes/note-creation";
import { fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { apiModule } from "../module";

import { LocalRestApiBridge } from "./local-rest-api-bridge";

import type { IRoute, Request, Response } from "express";

const HOST_LOADED_EVENT = "obsidian-local-rest-api:loaded";

function chainableRoute(): IRoute {
  const get = vi.fn();
  const route = { get } as unknown as IRoute;
  get.mockReturnValue(route);
  return route;
}

function fakeLocalRestApi() {
  return {
    apiVersion: 2,
    addRoute: vi.fn(() => chainableRoute()),
    addPublicRoute: vi.fn(),
    addMcpTool: vi.fn(),
    unregister: vi.fn(),
  };
}

type Handler = (request: Request, response: Response) => void;

function recordingLocalRestApi() {
  const handlers = new Map<string, Handler>();
  const addRoute = vi.fn((path: string) => {
    const route: Record<string, unknown> = {};
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      route[method] = (handler: Handler) => {
        handlers.set(`${method} ${path}`, handler);
        return route;
      };
    }
    return route as unknown as IRoute;
  });
  return {
    handlers,
    api: { apiVersion: 2, addRoute, addPublicRoute: vi.fn(), addMcpTool: vi.fn(), unregister: vi.fn() },
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
    // Exercises routes.ts's real addRoute("/journals/").get(handler) chain: addRoute itself
    // succeeds (so the handle is already held), and the throw comes from the second call in
    // the chain, the same shape a host-side route collision would take.
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

  it("answers a whole-file PUT through NoteCreationService.replaceContent", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, apiModule],
      data: { journals: { work: fixedJournal("work", { type: "day" }) }, shelves: {} },
      initialize: [VaultSubscriptionService],
    });
    const host = recordingLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => host.api });
    const replaceContent = vi.spyOn(harness.resolve(NoteCreationService), "replaceContent");
    harness.resolve(LocalRestApiBridge).initialize();
    const handler = host.handlers.get("put /journals/:name/:date");
    if (handler === undefined) throw new Error("no whole-file PUT route registered");
    let status: number | undefined;
    const response = {
      status(code: number) {
        status = code;
        return response;
      },
      json: vi.fn(),
      end: vi.fn(),
    };

    handler(
      {
        params: { name: "work", date: "2026-08-18" },
        body: "new body",
        path: "/journals/work/2026-08-18",
      } as unknown as Request,
      response as unknown as Response,
    );
    await vi.waitFor(() => {
      expect(status).not.toBeUndefined();
    });

    expect(status).toBe(204);
    expect(replaceContent).toHaveBeenCalledWith("work", "2026-08-18", "new body");
    expect(harness.host.files.get("2026-08-18.md")?.content).toBe("new body");
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
