import { type TFile, type App, moment } from "obsidian";
import type { TemplaterPlugin } from "../types/templater.types";
import type { TemplateContext } from "../types/template.types";
import { date_from_string } from "../calendar";
import type { MomentDate } from "@/types/date.types";

const momentUnits = {
  d: "day",
  m: "month",
  q: "quarter",
  w: "week",
  y: "year",
  h: "hour",
} as const;

function processDateModifications(
  date: MomentDate,
  modifiers: {
    format?: string;
    math?: string;
    unit?: string;
    shift?: "start" | "end";
    shiftTo?: string;
  },
  defaultFormat: string,
): string {
  if (modifiers.math && modifiers.unit) {
    date.add(Number.parseInt(modifiers.math, 10), momentUnits[modifiers.unit as keyof typeof momentUnits]);
  }
  if (modifiers.shift && modifiers.shiftTo) {
    if (modifiers.shiftTo === "decade") {
      const year =
        modifiers.shift === "start" ? date.year() - (date.year() % 10) : date.year() + (9 - (date.year() % 10));

      date.year(year);
      if (modifiers.shift === "start") {
        date.startOf("year");
      } else {
        date.endOf("year");
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      date[modifiers.shift === "start" ? "startOf" : "endOf"](modifiers.shiftTo as any);
    }
  }
  return date.format(modifiers.format ?? defaultFormat);
}

export function replaceTemplateVariables(template: string, context: TemplateContext): string {
  let content = template ?? "";
  for (const [name, variable] of Object.entries(context)) {
    switch (variable.type) {
      case "string":
      case "number": {
        content = content.replaceAll(`{{${name}}}`, (variable.value ?? "").toString());
        break;
      }
      case "date": {
        const regExp = new RegExp(
          // eslint-disable-next-line @cspell/spellchecker
          `{{\\s*(${name})\\s*((?<math>[+-]\\d+)(?<unit>[yqmwd]))?\\s*(<(?<shift>start|end)Of=(?<shiftTo>.*?)>)?\\s*(:(?<format>.*?))?}}`,
          "gi",
        );
        content = content.replaceAll(regExp, (...rest) => {
          const groups = rest.at(-1);
          const templateVariable = date_from_string(variable.value);
          return processDateModifications(templateVariable, groups, variable.defaultFormat);
        });
        break;
      }
    }
  }
  const now = moment();
  const timeFormat = "HH:mm";
  content = content.replaceAll(
    /{{\s*(time|current_time)\s*((?<math>[+-]\d+)(?<unit>[yqmwd]))?\s*(<(?<shift>start|end)Of=(?<shiftTo>.*?)>)?\s*(:(?<format>.*?))?}}/gi,
    (...rest) => {
      const groups = rest.at(-1);
      const templateVariable = now.clone();
      return processDateModifications(templateVariable, groups, timeFormat);
    },
  );
  const dateFormat = "YYYY-MM-DD";
  content = content.replaceAll(
    /{{\s*(current_date)\s*((?<math>[+-]\d+)(?<unit>[yqmwd]))?\s*(<(?<shift>start|end)Of=(?<shiftTo>.*?)>)?\s*(:(?<format>.*?))?}}/gi,
    (...rest) => {
      const groups = rest.at(-1);
      const templateVariable = now.clone();
      return processDateModifications(templateVariable, groups, dateFormat);
    },
  );

  return content;
}

export function canApplyTemplater(app: App, content: string): boolean {
  if (!content.includes("<%") && !content.includes("%>")) return false;
  const templaterPlugin = app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null;
  if (!templaterPlugin) return false;
  // version support check
  if (!("templater" in templaterPlugin)) return false;
  if (!("create_running_config" in templaterPlugin.templater)) return false;
  if (!("parse_template" in templaterPlugin.templater)) return false;
  return true;
}

export function supportsTemplaterCursor(app: App): boolean {
  const templaterPlugin = app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null;
  if (!templaterPlugin) return false;
  if (!("editor_handler" in templaterPlugin)) return false;
  if (!("jump_to_next_cursor_location" in templaterPlugin.editor_handler)) return false;
  return true;
}

export async function tryTemplaterCursorJump(app: App, note: TFile) {
  if (!supportsTemplaterCursor(app)) return false;
  const templaterPlugin = app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null;
  if (!templaterPlugin) return false;
  await templaterPlugin.editor_handler.jump_to_next_cursor_location(note, true);
  return true;
}

export async function tryApplyingTemplater(
  app: App,
  templateFile: TFile,
  note: TFile,
  content: string,
): Promise<string> {
  if (!canApplyTemplater(app, content)) return content;
  const templaterPlugin = app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null;
  if (!templaterPlugin) return content;
  try {
    const running_config = templaterPlugin.templater.create_running_config(
      templateFile,
      note,
      0, // RunMode.CreateNewFromTemplate
    );
    return await templaterPlugin.templater.parse_template(running_config, content);
  } catch (error) {
    console.error("Error applying templater", error);
  }
  return content;
}
