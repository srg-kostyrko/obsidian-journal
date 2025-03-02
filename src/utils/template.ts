import { type TFile, type App, moment } from "obsidian";
import type { TemplaterPlugin } from "../types/templater.types";
import type { TemplateContext } from "../types/template.types";
import { date_from_string } from "../calendar";

// TODO add tests

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
        // eslint-disable-next-line @cspell/spellchecker
        const regExp = new RegExp(`{{\\s*(${name})\\s*(([+-]\\d+)([yqmwd]))?\\s*(:(.*?))?}}`, "gi");
        content = content.replaceAll(regExp, (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
          const templateVariable = date_from_string(variable.value);
          if (calc) {
            templateVariable.add(Number.parseInt(timeDelta, 10), unit);
          }
          return templateVariable.format(format ?? variable.defaultFormat);
        });
        break;
      }
    }
  }
  const now = moment();
  const timeFormat = "HH:mm";
  content = content.replaceAll(
    /{{\s*(time|current_time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi,
    (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
      const templateVariable = now.clone();
      if (calc) {
        templateVariable.add(Number.parseInt(timeDelta, 10), unit);
      }
      if (format) {
        return templateVariable.format(format);
      }
      return templateVariable.format(timeFormat);
    },
  );
  const dateFormat = "YYYY-MM-DD";
  content = content.replaceAll(
    /{{\s*(current_date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi,
    (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
      const templateVariable = now.clone();
      if (calc) {
        templateVariable.add(Number.parseInt(timeDelta, 10), unit);
      }
      if (format) {
        return templateVariable.format(format);
      }
      return templateVariable.format(dateFormat);
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
