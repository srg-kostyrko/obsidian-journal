import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalPluginToken } from "../../internal/tokens";

import { CommandService } from "./command-service";

function build(): { service: CommandService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(CommandService).useClass(CommandService);
  return { service: c.resolve(CommandService), host };
}

describe("CommandService", () => {
  it("registers a command in the host", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", execute: vi.fn() });
    expect(host.commands.has("demo")).toBe(true);
  });

  it("runs execute when a command without a check is invoked", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      execute: () => {
        ran = true;
      },
    });
    host.commands.get("demo")?.callback?.();
    expect(ran).toBe(true);
  });

  it("reports availability through the check predicate", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", check: () => false, execute: vi.fn() });
    expect(host.commands.get("demo")?.checkCallback?.(true)).toBe(false);
  });

  it("reports availability as available when the check passes", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", check: () => true, execute: vi.fn() });
    expect(host.commands.get("demo")?.checkCallback?.(true)).toBe(true);
  });

  it("skips execute when the check fails", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      check: () => false,
      execute: () => {
        ran = true;
      },
    });
    host.commands.get("demo")?.checkCallback?.(false);
    expect(ran).toBe(false);
  });

  it("runs execute when the check passes", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      check: () => true,
      execute: () => {
        ran = true;
      },
    });
    const result = host.commands.get("demo")?.checkCallback?.(false);
    expect(ran).toBe(true);
    expect(result).toBe(true);
  });

  it("removes the command on unregister", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", execute: vi.fn() });
    service.unregister("demo");
    expect(host.commands.has("demo")).toBe(false);
  });

  it("ignores unregister for an unknown id", () => {
    const { service } = build();
    expect(() => service.unregister("missing")).not.toThrow();
  });

  it("adds a ribbon icon when ribbon is enabled", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", icon: "star", ribbon: true, execute: vi.fn() });
    expect(host.ribbonIcons).toHaveLength(1);
    expect(host.ribbonIcons[0]?.icon).toBe("star");
    expect(host.ribbonIcons[0]?.title).toBe("Demo");
  });

  it("does not add a ribbon icon when ribbon is disabled", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", icon: "star", ribbon: false, execute: vi.fn() });
    expect(host.ribbonIcons).toHaveLength(0);
  });

  it("runs execute when the ribbon icon is clicked", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      icon: "star",
      ribbon: true,
      execute: () => {
        ran = true;
      },
    });
    host.ribbonIcons[0]?.callback(new MouseEvent("click"));
    expect(ran).toBe(true);
  });

  it("skips execute on ribbon click when the check fails", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      icon: "star",
      ribbon: true,
      check: () => false,
      execute: () => {
        ran = true;
      },
    });
    host.ribbonIcons[0]?.callback(new MouseEvent("click"));
    expect(ran).toBe(false);
  });

  it("removes the ribbon element on unregister", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", icon: "star", ribbon: true, execute: vi.fn() });
    const element = host.ribbonIcons[0]?.element;
    service.unregister("demo");
    expect(element?.isConnected).toBe(false);
  });
});
