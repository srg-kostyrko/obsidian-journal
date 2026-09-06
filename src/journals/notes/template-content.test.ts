import { beforeEach, describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { expectOk } from "@/infrastructure/result/testing";
import { TemplateContext } from "@/templates";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { TemplateContentService } from "./template-content";

import type { JournalMetadata } from "../types";

const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

describe("TemplateContentService.renderFor", () => {
  it("resolves {{note_name}} in a template file path", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/{{note_name}}"] }) },
      },
    });
    harness.host.putFile("Templates/2026-05-19.md", "per-note template body");

    const result = await harness
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);

    expectOk(result);
    expect(result.value).toBe("per-note template body");
  });

  it("falls through to the next template when the first existing one is empty", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/empty.md", "Templates/real.md"] }),
        },
      },
    });
    harness.host.putFile("Templates/empty.md", "");
    harness.host.putFile("Templates/real.md", "real body");

    const result = await harness
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);

    expectOk(result);
    expect(result.value).toBe("real body");
  });

  it("resolves to empty string when no templates are configured", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    const result = await harness
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);

    expect(result.isOk() && result.value).toBe("");
  });

  it("renders the first existing template content through the engine", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/missing.md", "Templates/daily.md"] }),
        },
      },
    });
    harness.host.putFile("Templates/daily.md", "# {{date}}\n");

    const result = await harness
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);

    expect(result.isOk() && result.value).toBe("# 2026-05-19\n");
  });

  it("renders the template path itself through the engine before looking it up", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/{{date:YYYY}}/daily.md"] }),
        },
      },
    });
    harness.host.putFile("Templates/2026/daily.md", "body");

    const result = await harness
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);

    expect(result.isOk() && result.value).toBe("body");
  });

  it("returns empty string when none of the configured templates exist", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/missing.md"] }) },
      },
    });

    const result = await harness
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);

    expect(result.isOk() && result.value).toBe("");
  });
});

describe("TemplateContentService.renderFor — note_name binding", () => {
  describe("a journal with one template file", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) },
        },
      });
    });

    it("exposes note_name to template body matching the rendered basename", async () => {
      harness.host.putFile("Templates/daily.md", "{{note_name}}");

      const result = await harness
        .resolve(TemplateContentService)
        .renderFor("daily", meta, "2026-05-20", "note.md" as VaultPath);

      expectOk(result);
      expect(result.value).toBe("2026-05-20");
    });

    it("aliases title to note_name in template body", async () => {
      harness.host.putFile("Templates/daily.md", "{{title}}");

      const result = await harness
        .resolve(TemplateContentService)
        .renderFor("daily", meta, "my-note", "note.md" as VaultPath);

      expectOk(result);
      expect(result.value).toBe("my-note");
    });
  });

  it("does not expose note_name when resolving the templatePath itself", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/{{note_name}}.md"] }) },
      },
    });

    const result = await harness
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-20", "note.md" as VaultPath);

    expectOk(result);
    expect(result.value).toBe("");
  });
});

describe("TemplateContentService.renderFor — Templater", () => {
  describe("a journal with one template file", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) },
        },
      });
    });

    it("passes engine-rendered content through Templater", async () => {
      harness.host.putFile("Templates/daily.md", "# {{date}}");
      harness.templater.setTransform((content) => `${content} [templated]`);

      const result = await harness
        .resolve(TemplateContentService)
        .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);

      expectOk(result);
      expect(result.value).toBe("# 2026-05-19 [templated]");
    });

    it("passes the winning template path and target path to Templater", async () => {
      harness.host.putFile("Templates/daily.md", "body");

      await harness
        .resolve(TemplateContentService)
        .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);

      expect(harness.templater.applyCalls).toEqual([
        { templatePath: "Templates/daily.md", targetPath: "2026-05-19.md", content: "body" },
      ]);
    });
  });

  it("does not invoke Templater when no templates are configured", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    await harness.resolve(TemplateContentService).renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);

    expect(harness.templater.applyCalls).toEqual([]);
  });
});

describe("renderTemplates", () => {
  it("renders the first template that has content", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule] });
    harness.host.putFile("Templates/Empty.md", "");
    harness.host.putFile("Templates/Standup.md", "# {{note_name}}");
    const content = harness.resolve(TemplateContentService);
    const context = TemplateContext.empty().string("note_name", "Standup 1");

    const rendered = await content.renderTemplates(
      ["Templates/Empty", "Templates/Standup"],
      context,
      "Meetings/Standup 1.md" as VaultPath,
    );

    expectOk(rendered);
    expect(rendered.value).toBe("# Standup 1");
  });

  it("renders nothing when no template matches", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule] });
    const content = harness.resolve(TemplateContentService);
    const context = TemplateContext.empty();

    const rendered = await content.renderTemplates(["Templates/Gone"], context, "x.md" as VaultPath);

    expectOk(rendered);
    expect(rendered.value).toBe("");
  });
});
