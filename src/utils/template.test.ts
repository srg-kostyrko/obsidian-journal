import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { replaceTemplateVariables } from "./template";
import type { TemplateContext } from "@/types/template.types";
import moment from "moment";
import { restoreLocale, updateLocale } from "@/calendar";

describe("template functions", () => {
  beforeAll(() => {
    updateLocale(1, 4);
  });

  afterAll(() => {
    restoreLocale();
  });

  describe("template variables", () => {
    it("replaces string template variable", () => {
      const template = "Hello {{name}}";
      const context: TemplateContext = { name: { type: "string", value: "World" } };
      const result = replaceTemplateVariables(template, context);
      expect(result).toBe("Hello World");
    });

    it("replaces number template variable", () => {
      const template = "Sprint {{index}}";
      const context: TemplateContext = { index: { type: "number", value: 1 } };
      const result = replaceTemplateVariables(template, context);
      expect(result).toBe("Sprint 1");
    });

    it("replaces time and current_time variables", () => {
      const template = "The time is {{time}} and the current time is {{current_time}}";
      const result = replaceTemplateVariables(template, {});
      const now = moment().format("HH:mm");

      expect(result).toBe(`The time is ${now} and the current time is ${now}`);
    });

    it("replaces current date variable", () => {
      const template = "Today is {{current_date}}";
      const result = replaceTemplateVariables(template, {});
      const now = moment().format("YYYY-MM-DD");

      expect(result).toBe(`Today is ${now}`);
    });

    describe("date variables", () => {
      it("replaces date template variable using default format", () => {
        const template = "Today is {{date}}";
        const context: TemplateContext = { date: { type: "date", value: "2022-01-01", defaultFormat: "MMM D, YYYY" } };
        const result = replaceTemplateVariables(template, context);
        expect(result).toBe("Today is Jan 1, 2022");
      });

      it("supports overriding date format as part of variable", () => {
        const template = "Today is {{date:MMM D, YYYY}}";
        const context: TemplateContext = { date: { type: "date", value: "2022-01-01", defaultFormat: "YYYY-MM-DD" } };
        const result = replaceTemplateVariables(template, context);
        expect(result).toBe("Today is Jan 1, 2022");
      });

      it.each([
        ["{{date+1d}}", "2022-01-01", "2022-01-02"],
        ["{{date-1d}}", "2022-01-01", "2021-12-31"],
        ["{{date+1w}}", "2022-01-01", "2022-01-08"],
        ["{{date-1w}}", "2022-01-01", "2021-12-25"],
        ["{{date+1m}}", "2022-01-01", "2022-02-01"],
        ["{{date-1m}}", "2022-01-01", "2021-12-01"],
        ["{{date+1q}}", "2022-01-01", "2022-04-01"],
        ["{{date-1q}}", "2022-01-01", "2021-10-01"],
        ["{{date+1y}}", "2022-01-01", "2023-01-01"],
        ["{{date-1y}}", "2022-01-01", "2021-01-01"],
      ])("supports date arithmetic %s", (template: string, date: string, expected: string) => {
        const context: TemplateContext = { date: { type: "date", value: date, defaultFormat: "YYYY-MM-DD" } };
        const result = replaceTemplateVariables(template, context);
        expect(result).toBe(expected);
      });

      it.each([
        ["{{date<startOf=week>}}", "2022-01-05", "2022-01-03"],
        ["{{date<endOf=week>}}", "2022-01-05", "2022-01-09"],
        ["{{date<startOf=month>}}", "2022-01-04", "2022-01-01"],
        ["{{date<endOf=month>}}", "2022-01-04", "2022-01-31"],
        ["{{date<startOf=quarter>}}", "2022-01-04", "2022-01-01"],
        ["{{date<endOf=quarter>}}", "2022-01-04", "2022-03-31"],
        ["{{date<startOf=year>}}", "2022-01-04", "2022-01-01"],
        ["{{date<endOf=year>}}", "2022-01-04", "2022-12-31"],
        ["{{date<startOf=decade>}}", "2022-01-04", "2020-01-01"],
        ["{{date<endOf=decade>}}", "2022-01-04", "2029-12-31"],
      ])("supports startOf/endOf modifiers of %s", (template: string, date: string, expected: string) => {
        const context: TemplateContext = { date: { type: "date", value: date, defaultFormat: "YYYY-MM-DD" } };
        const result = replaceTemplateVariables(template, context);
        expect(result).toBe(expected);
      });
    });
  });
});
