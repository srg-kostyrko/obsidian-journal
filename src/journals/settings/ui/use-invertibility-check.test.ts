import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, ref, type Ref } from "vue";

import type { AnchorString } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import { customJournal, fixedJournal } from "../../testing";

import { useInvertibilityCheck } from "./use-invertibility-check";

import type { JournalConfig } from "../../config";

afterEach(() => cleanup());

function buildContainer(): Container {
  const engine = installTestEngine();
  const container = new Container();
  container.register(TemplateEngine).useValue(engine);
  return container;
}

function probe(config: Ref<JournalConfig | undefined>): { warning: Ref<unknown> } {
  const container = buildContainer();
  let captured: Ref<unknown> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useInvertibilityCheck(config);
      return undefined;
    },
    template: "<div />",
  });
  render(Probe, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return { warning: captured! };
}

function withName(nameTemplate: string): JournalConfig {
  return fixedJournal("daily", { type: "day" }, { nameTemplate });
}

describe("useInvertibilityCheck", () => {
  it("returns null for an invertible template with only known variables", () => {
    const { warning } = probe(ref(withName("{{date}}-{{journal_name}}")));
    expect(warning.value).toBeNull();
  });

  it("returns null for a static template", () => {
    const { warning } = probe(ref(withName("static-note")));
    expect(warning.value).toBeNull();
  });

  it("flags a template containing a function token", () => {
    const { warning } = probe(ref(withName("{{date}}-{{format(YYYY)}}")));
    expect(warning.value).toMatchObject({ kind: "non-invertible", reason: "function-token" });
  });

  it("flags a template containing an unknown variable", () => {
    const { warning } = probe(ref(withName("{{date}}-{{mystery}}")));
    expect(warning.value).toMatchObject({ kind: "non-invertible", reason: "unknown-variable", offending: "mystery" });
  });

  it("does not flag a configured numbering variable alongside a date", () => {
    const config = customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "{{date}}-{{index}}" });
    const { warning } = probe(ref(config));
    expect(warning.value).toBeNull();
  });

  it("returns null for an index-only template when the numbering is invertible", () => {
    const config = customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "Sprint {{index}}" });
    const { warning } = probe(ref(config));
    expect(warning.value).toBeNull();
  });

  it("flags a cyclic-top warning for an index-only template when the sole digit is cyclic", () => {
    const config = customJournal("sprints", "week", 1, "2024-01-01", {
      nameTemplate: "Sprint {{index}}",
      numbering: {
        enabled: true,
        anchorDate: "2024-01-01" as AnchorString,
        allowBefore: false,
        sources: [
          { variable: "index", frontmatterKey: "sprint-number", anchorValue: 1, reset: { kind: "after", count: 3 } },
        ],
      },
    });
    const { warning } = probe(ref(config));
    expect(warning.value).toEqual({ kind: "cyclic-top" });
  });

  it("reports cyclic-top when the most significant digit resets", () => {
    const config = withName("Q{{quarter}}W{{week}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "quarter", frontmatterKey: "journal-quarter", anchorValue: 1, reset: { kind: "after", count: 4 } },
        { variable: "week", frontmatterKey: "journal-week", anchorValue: 1, reset: { kind: "after", count: 13 } },
      ],
    };
    const { warning } = probe(ref(config));
    expect(warning.value).toEqual({ kind: "cyclic-top" });
  });

  it("reports no warning when every invertible digit appears in the template", () => {
    const config = withName("Release{{release}}Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const { warning } = probe(ref(config));
    expect(warning.value).toBeNull();
  });

  it("names the digits missing from the template", () => {
    const config = withName("Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const { warning } = probe(ref(config));
    expect(warning.value).toEqual({ kind: "unused-digits", missing: ["release"] });
  });

  it("counts a digit used only in the folder as present", () => {
    const config = fixedJournal("daily", { type: "day" }, { nameTemplate: "Sprint{{sprint}}", folder: "R{{release}}" });
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const { warning } = probe(ref(config));
    expect(warning.value).toBeNull();
  });

  it("names the digit that emits no carry", () => {
    const config = withName("Release{{release}}Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } },
      ],
    };
    const { warning } = probe(ref(config));
    expect(warning.value).toEqual({ kind: "no-carry", offending: "sprint" });
  });

  it("reports the cyclic first digit ahead of a lower digit that emits no carry", () => {
    const config = withName("Release{{release}}Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 1, reset: { kind: "after", count: 4 } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } },
      ],
    };
    const { warning } = probe(ref(config));
    expect(warning.value).toEqual({ kind: "cyclic-top" });
  });

  it("stays silent while sequential numbers are turned off", () => {
    const config = withName("Sprint{{sprint}}");
    config.numbering = {
      enabled: false,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const { warning } = probe(ref(config));
    expect(warning.value).toBeNull();
  });
});
