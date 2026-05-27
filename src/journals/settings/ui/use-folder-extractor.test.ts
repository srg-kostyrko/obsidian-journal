import { describe, expect, it } from "vitest";

import type { JournalConfig } from "@/journals";

import { extractFromNameTemplate, extractFromDateFormat } from "./use-folder-extractor";

function baseConfig(overrides: Partial<JournalConfig>): JournalConfig {
  return {
    name: "daily",
    write: { type: "day" },
    timeline: { start: "2026-01-01" as never, end: { kind: "never" } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2026-01-01" as never, allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    decorations: [],
    navBlock: { type: "create", rows: [], decorateWholeBlock: false },
    ...overrides,
  };
}

describe("extractFromNameTemplate", () => {
  it("moves the path prefix into folder and leaves the last segment as nameTemplate", () => {
    const config = baseConfig({ nameTemplate: "year/month/{{date}}", folder: "" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("year/month");
    expect(config.nameTemplate).toBe("{{date}}");
  });

  it("appends to an existing folder", () => {
    const config = baseConfig({ nameTemplate: "extra/{{date}}", folder: "Daily" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("Daily/extra");
    expect(config.nameTemplate).toBe("{{date}}");
  });

  it("is a no-op when nameTemplate has no slash", () => {
    const config = baseConfig({ nameTemplate: "{{date}}", folder: "Daily" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("Daily");
    expect(config.nameTemplate).toBe("{{date}}");
  });
});

describe("extractFromDateFormat", () => {
  it("converts path segments into {{date:format}} tokens prefixed onto folder", () => {
    const config = baseConfig({ dateFormat: "YYYY/MM/DD", folder: "" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("{{date:YYYY}}/{{date:MM}}");
    expect(config.dateFormat).toBe("DD");
  });

  it("appends to an existing folder", () => {
    const config = baseConfig({ dateFormat: "YYYY/MM", folder: "Daily" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("Daily/{{date:YYYY}}");
    expect(config.dateFormat).toBe("MM");
  });

  it("is a no-op when dateFormat has no slash", () => {
    const config = baseConfig({ dateFormat: "YYYY-MM-DD", folder: "" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("");
    expect(config.dateFormat).toBe("YYYY-MM-DD");
  });
});
