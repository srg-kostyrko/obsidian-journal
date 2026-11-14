import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";
import { WindowCssVariables } from "./window-css-variables";

function build(host = createFakeHost()): { variables: WindowCssVariables; host: FakeHost } {
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(WindowCssVariables).useClass(WindowCssVariables);
  return { variables: c.resolve(WindowCssVariables), host };
}

function openPopout(host: FakeHost, id: string): Window {
  const win = host.windowFor(id);
  host.emitWorkspace("window-open", {}, win);
  return win;
}

const read = (win: Window, name = "--a"): string => win.document.body.style.getPropertyValue(name);

describe("WindowCssVariables", () => {
  it("sets variables on the main window", () => {
    const { variables, host } = build();
    variables.install(() => ({ "--a": "1" }));
    expect(read(host.windowFor("main"))).toBe("1");
  });

  it("sets them on a popout opened later", () => {
    const { variables, host } = build();
    variables.install(() => ({ "--a": "1" }));
    expect(read(openPopout(host, "popout"))).toBe("1");
  });

  it("sets them on a popout already open at load", () => {
    const host = createFakeHost();
    host.openEditor("Daily/2026-10-21.md", "");
    host.workspace.openWindows.set("Daily/2026-10-21.md", "popout");
    const { variables } = build(host);
    variables.install(() => ({ "--a": "1" }));
    expect(read(host.windowFor("popout"))).toBe("1");
  });

  it("refresh rewrites every window and drops a removed key", () => {
    const { variables, host } = build();
    let map: Record<string, string> = { "--a": "1", "--b": "2" };
    const installed = variables.install(() => map);
    const popout = openPopout(host, "popout");
    map = { "--a": "3" };
    installed.refresh();
    for (const win of [host.windowFor("main"), popout]) {
      expect(read(win)).toBe("3");
      expect(read(win, "--b")).toBe("");
    }
  });

  it("window-close forgets the popout", () => {
    const { variables, host } = build();
    let map: Record<string, string> = { "--a": "1" };
    const installed = variables.install(() => map);
    const popout = openPopout(host, "popout");
    host.emitWorkspace("window-close", {}, popout);
    map = { "--a": "2" };
    expect(() => installed.refresh()).not.toThrow();
    expect(read(popout)).toBe("1");
    expect(read(host.windowFor("main"))).toBe("2");
  });

  it("remove clears every window", () => {
    const { variables, host } = build();
    const installed = variables.install(() => ({ "--a": "1" }));
    const popout = openPopout(host, "popout");
    installed.remove();
    expect(read(host.windowFor("main"))).toBe("");
    expect(read(popout)).toBe("");
  });

  it("unload removes the properties everywhere", () => {
    const { variables, host } = build();
    variables.install(() => ({ "--a": "1" }));
    const popout = openPopout(host, "popout");
    host.triggerUnload();
    expect(read(host.windowFor("main"))).toBe("");
    expect(read(popout)).toBe("");
  });

  it("refresh and install after unload set nothing", () => {
    const { variables, host } = build();
    const installed = variables.install(() => ({ "--a": "1" }));
    host.triggerUnload();
    installed.refresh();
    variables.install(() => ({ "--b": "2" }));
    expect(read(host.windowFor("main"))).toBe("");
    expect(read(host.windowFor("main"), "--b")).toBe("");
    // A window opening after unload must not pick up an entry installed after it.
    expect(read(openPopout(host, "late"), "--b")).toBe("");
  });
});
