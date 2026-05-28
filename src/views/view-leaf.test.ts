import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar/types";
import { Container } from "@/infrastructure/di";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";

import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";
import { JournalViewLeaf } from "./view-leaf";

import type { View, ViewId } from "./config";

function seedView(overrides: Partial<View> = {}): View {
  return {
    id: "abc" as ViewId,
    name: "Calendar",
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
    ...overrides,
  };
}

function build(view: View = seedView()) {
  const host = createFakeHost();
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts({ [view.id]: view }, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsService).useClass(ViewsService);
  const leaf = { containerEl: document.createElement("div") };
  return { leafInstance: new JournalViewLeaf(leaf as never, view.id, c), host };
}

describe("JournalViewLeaf", () => {
  describe("setState", () => {
    it("stores refDate from incoming state", async () => {
      const { leafInstance } = build();
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBe("2026-06-01");
    });

    it("calls workspace.requestSaveLayout when state changes", async () => {
      const { leafInstance, host } = build();
      const before = host.workspace.saveLayoutCalls;
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      expect(host.workspace.saveLayoutCalls).toBe(before + 1);
    });
  });

  describe("getState", () => {
    it("returns refDate undefined by default", () => {
      const { leafInstance } = build();
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBeUndefined();
    });

    it("returns shelf undefined by default", () => {
      const { leafInstance } = build();
      const state = leafInstance.getState() as { shelf?: string | null };
      expect(state.shelf).toBeUndefined();
    });
  });
});
