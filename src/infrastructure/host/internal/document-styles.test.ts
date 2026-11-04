import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { DocumentStyles } from "./document-styles";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

function build(host = createFakeHost()): { styles: DocumentStyles; host: FakeHost } {
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(DocumentStyles).useClass(DocumentStyles);
  return { styles: c.resolve(DocumentStyles), host };
}

function openPopout(host: FakeHost, id: string): Window {
  const win = host.windowFor(id);
  host.emitWorkspace("window-open", {}, win);
  return win;
}

const textIn = (win: Window, id = "x"): string | undefined =>
  win.document.querySelector(`[id="${CSS.escape(id)}"]`)?.textContent;

describe("DocumentStyles", () => {
  it("installs into the main window", () => {
    const { styles, host } = build();
    styles.install("x", () => "a{}");
    expect(textIn(host.windowFor("main"))).toBe("a{}");
  });

  it("installs into a popout opened later", () => {
    const { styles, host } = build();
    styles.install("x", () => "a{}");
    const popout = openPopout(host, "popout");
    expect(textIn(popout)).toBe("a{}");
  });

  it("installs into a popout already open at load", () => {
    const host = createFakeHost();
    host.openEditor("Daily/2026-10-21.md", "");
    host.workspace.openWindows.set("Daily/2026-10-21.md", "popout");
    const { styles } = build(host);
    styles.install("x", () => "a{}");
    expect(textIn(host.windowFor("popout"))).toBe("a{}");
  });

  it("refresh rewrites every window", () => {
    const { styles, host } = build();
    let css = "a{}";
    const installed = styles.install("x", () => css);
    const popout = openPopout(host, "popout");
    css = "b{}";
    installed.refresh();
    expect(textIn(host.windowFor("main"))).toBe("b{}");
    expect(textIn(popout)).toBe("b{}");
  });

  it("window-close drops the popout", () => {
    const { styles, host } = build();
    let css = "a{}";
    const installed = styles.install("x", () => css);
    const popout = openPopout(host, "popout");
    host.emitWorkspace("window-close", {}, popout);
    css = "b{}";
    expect(() => installed.refresh()).not.toThrow();
    expect(textIn(popout)).toBe("a{}");
    expect(textIn(host.windowFor("main"))).toBe("b{}");
  });

  it("installing the same id twice replaces the first", () => {
    const { styles, host } = build();
    styles.install("x", () => "a{}");
    styles.install("x", () => "b{}");
    const main = host.windowFor("main");
    expect(main.document.querySelectorAll('[id="x"]')).toHaveLength(1);
    expect(textIn(main)).toBe("b{}");
  });

  it("remove drops the element from every window", () => {
    const { styles, host } = build();
    const installed = styles.install("x", () => "a{}");
    const popout = openPopout(host, "popout");
    installed.remove();
    expect(textIn(host.windowFor("main"))).toBeUndefined();
    expect(textIn(popout)).toBeUndefined();
  });

  it("unload removes every style element", () => {
    const { styles, host } = build();
    styles.install("x", () => "a{}");
    const popout = openPopout(host, "popout");
    host.triggerUnload();
    expect(textIn(host.windowFor("main"))).toBeUndefined();
    expect(textIn(popout)).toBeUndefined();
  });

  it("refresh after unload creates nothing", () => {
    const { styles, host } = build();
    const installed = styles.install("x", () => "a{}");
    host.triggerUnload();
    installed.refresh();
    styles.install("y", () => "c{}");
    expect(textIn(host.windowFor("main"))).toBeUndefined();
    expect(textIn(host.windowFor("main"), "y")).toBeUndefined();
  });
});
