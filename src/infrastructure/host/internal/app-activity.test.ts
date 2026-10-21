import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";

import { AppActivity } from "./app-activity";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

function build(): { activity: AppActivity; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(AppActivity).useClass(AppActivity);
  return { activity: c.resolve(AppActivity), host };
}

function setVisibility(win: Window, state: DocumentVisibilityState): void {
  Object.assign(win.document, { visibilityState: state });
  win.document.dispatchEvent(new Event("visibilitychange"));
}

function openPopout(host: FakeHost, id: string): Window {
  const win = host.windowFor(id);
  host.emitWorkspace("window-open", {}, win);
  return win;
}

describe("AppActivity", () => {
  it("focus and visible both resume", () => {
    const { activity, host } = build();
    const callback = vi.fn();
    activity.onResume(callback);
    const main = host.windowFor("main");
    const popout = openPopout(host, "popout");

    main.dispatchEvent(new Event("focus"));
    setVisibility(main, "visible");
    popout.dispatchEvent(new Event("focus"));
    setVisibility(popout, "visible");

    expect(callback).toHaveBeenCalledTimes(4);
  });

  it("hidden does not", () => {
    const { activity, host } = build();
    const callback = vi.fn();
    activity.onResume(callback);
    const popout = openPopout(host, "popout");

    setVisibility(host.windowFor("main"), "hidden");
    setVisibility(popout, "hidden");

    expect(callback).not.toHaveBeenCalled();
  });

  it("unsubscribe stops callbacks", () => {
    const { activity, host } = build();
    const kept = vi.fn();
    const dropped = vi.fn();
    activity.onResume(kept);
    const unsubscribe = activity.onResume(dropped);

    unsubscribe();
    host.windowFor("main").dispatchEvent(new Event("focus"));

    expect(dropped).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledOnce();
  });

  it("a closed popout no longer resumes", () => {
    const { activity, host } = build();
    const callback = vi.fn();
    activity.onResume(callback);
    const popout = openPopout(host, "popout");

    host.emitWorkspace("window-close", {}, popout);
    popout.dispatchEvent(new Event("focus"));
    setVisibility(popout, "visible");

    expect(callback).not.toHaveBeenCalled();
  });

  it("unloading the plugin releases every window's listeners", () => {
    const { activity, host } = build();
    const callback = vi.fn();
    activity.onResume(callback);
    const popout = openPopout(host, "popout");

    host.triggerUnload();
    for (const win of [host.windowFor("main"), popout]) {
      win.dispatchEvent(new Event("focus"));
      setVisibility(win, "visible");
    }

    expect(callback).not.toHaveBeenCalled();
  });
});
