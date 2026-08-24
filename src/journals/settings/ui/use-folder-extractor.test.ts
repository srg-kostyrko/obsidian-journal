import { describe, expect, it } from "vitest";

import { fixedJournal } from "@/journals/testing";

import { extractFromNameTemplate, extractFromDateFormat } from "./use-folder-extractor";

describe("extractFromNameTemplate", () => {
  it("moves the path prefix into folder and leaves the last segment as nameTemplate", () => {
    const config = fixedJournal("daily", { type: "day" }, { nameTemplate: "year/month/{{date}}", folder: "" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("year/month");
    expect(config.nameTemplate).toBe("{{date}}");
  });

  it("appends to an existing folder", () => {
    const config = fixedJournal("daily", { type: "day" }, { nameTemplate: "extra/{{date}}", folder: "Daily" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("Daily/extra");
    expect(config.nameTemplate).toBe("{{date}}");
  });

  it("is a no-op when nameTemplate has no slash", () => {
    const config = fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}}", folder: "Daily" });
    extractFromNameTemplate(config);
    expect(config.folder).toBe("Daily");
    expect(config.nameTemplate).toBe("{{date}}");
  });
});

describe("extractFromDateFormat", () => {
  it("converts path segments into {{date:format}} tokens prefixed onto folder", () => {
    const config = fixedJournal("daily", { type: "day" }, { dateFormat: "YYYY/MM/DD", folder: "" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("{{date:YYYY}}/{{date:MM}}");
    expect(config.dateFormat).toBe("DD");
  });

  it("appends to an existing folder", () => {
    const config = fixedJournal("daily", { type: "day" }, { dateFormat: "YYYY/MM", folder: "Daily" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("Daily/{{date:YYYY}}");
    expect(config.dateFormat).toBe("MM");
  });

  it("is a no-op when dateFormat has no slash", () => {
    const config = fixedJournal("daily", { type: "day" }, { dateFormat: "YYYY-MM-DD", folder: "" });
    extractFromDateFormat(config);
    expect(config.folder).toBe("");
    expect(config.dateFormat).toBe("YYYY-MM-DD");
  });
});
