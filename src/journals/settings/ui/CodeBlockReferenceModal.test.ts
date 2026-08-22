import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { homeBlockKeys } from "@/code-blocks/home/home-config";
import { timelineBlockKeys, timelineModes } from "@/code-blocks/timeline/timeline-config";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import CodeBlockReferenceModal from "./CodeBlockReferenceModal.vue";

describe("CodeBlockReferenceModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { Daily: fixedJournal("Daily", { type: "day" }) } },
    });
  });

  it("documents all three code-block names", () => {
    harness.render(CodeBlockReferenceModal, {
      props: { journalName: "Daily" },
      global: { stubs: { NavigationCodeBlock: true, TimelineCodeBlock: true, HomeCodeBlock: true } },
    });
    expect(screen.getAllByText(/journal-nav/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/calendar-timeline/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/journals-home/).length).toBeGreaterThan(0);
  });

  it("lists every supported timeline mode", () => {
    harness.render(CodeBlockReferenceModal, {
      props: { journalName: "Daily" },
      global: { stubs: { NavigationCodeBlock: true, TimelineCodeBlock: true, HomeCodeBlock: true } },
    });
    for (const mode of timelineModes) {
      expect(screen.getAllByText(mode).length).toBeGreaterThan(0);
    }
  });

  it("lists every home block option", () => {
    harness.render(CodeBlockReferenceModal, {
      props: { journalName: "Daily" },
      global: { stubs: { NavigationCodeBlock: true, TimelineCodeBlock: true, HomeCodeBlock: true } },
    });
    for (const option of homeBlockKeys) {
      expect(screen.getAllByText(option).length).toBeGreaterThan(0);
    }
  });

  it("lists every timeline block option", () => {
    harness.render(CodeBlockReferenceModal, {
      props: { journalName: "Daily" },
      global: { stubs: { NavigationCodeBlock: true, TimelineCodeBlock: true, HomeCodeBlock: true } },
    });
    for (const option of timelineBlockKeys) {
      expect(screen.getAllByText(option).length).toBeGreaterThan(0);
    }
  });
});
