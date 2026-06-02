import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { timelineModes } from "@/code-blocks/timeline/timeline-config";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex } from "@/journals";

import CodeBlockReferenceModal from "./CodeBlockReferenceModal.vue";

class FakeCycleService {
  anchorOf(): Option<AnchorString> {
    return Option.some("2026-05-27" as AnchorString);
  }
}

function mount() {
  const container = new Container();
  container.register(JournalsIndex).useValue(new JournalsIndex());
  container.register(CycleService).useValue(new FakeCycleService() as unknown as CycleService);
  return render(CodeBlockReferenceModal, {
    props: { journalName: "Daily" },
    global: {
      stubs: { NavigationCodeBlock: true, TimelineCodeBlock: true, HomeCodeBlock: true },
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

beforeAll(() => initLocale("en"));
afterEach(() => cleanup());

describe("CodeBlockReferenceModal", () => {
  it("documents all three code-block names", () => {
    mount();
    expect(screen.getAllByText(/journal-nav/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/calendar-timeline/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/journals-home/).length).toBeGreaterThan(0);
  });

  it("lists every supported timeline mode", () => {
    mount();
    for (const mode of timelineModes) {
      expect(screen.getAllByText(mode).length).toBeGreaterThan(0);
    }
  });

  it("lists every home block option", () => {
    mount();
    for (const option of ["show", "separator", "scale", "shelf"]) {
      expect(screen.getAllByText(option).length).toBeGreaterThan(0);
    }
  });
});
