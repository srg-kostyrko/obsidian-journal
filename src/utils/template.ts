import { App, TFile, moment } from "obsidian";
import { TemplateContext } from "../contracts/template.types";
import { TemplaterPlugin } from "../contracts/templater.types";

export function replaceTemplateVariables(template: string, context: TemplateContext): string {
  let content = template ?? "";
  if (context.date) {
    const { value: date, defaultFormat } = context.date;
    content = content.replaceAll(
      /{{\s*(date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi,
      (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
        const templateVar = date.clone();
        if (calc) {
          templateVar.add(parseInt(timeDelta, 10), unit);
        }
        if (format) {
          return templateVar.format(format);
        }
        return templateVar.format(defaultFormat);
      },
    );
  }

  if (context.start_date) {
    const { value: start_date, defaultFormat } = context.start_date;
    content = content.replaceAll(
      /{{\s*(start_date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi,
      (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
        const templateVar = start_date.clone();
        if (calc) {
          templateVar.add(parseInt(timeDelta, 10), unit);
        }
        if (format) {
          return templateVar.format(format);
        }
        return templateVar.format(defaultFormat);
      },
    );
  }

  if (context.end_date) {
    const { value: end_date, defaultFormat } = context.end_date;
    content = content.replaceAll(
      /{{\s*(end_date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi,
      (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
        const templateVar = end_date.clone();
        if (calc) {
          templateVar.add(parseInt(timeDelta, 10), unit);
        }
        if (format) {
          return templateVar.format(format);
        }
        return templateVar.format(defaultFormat);
      },
    );
  }

  if (context.index) {
    const { value: index } = context.index;
    content = content.replaceAll("{{index}}", index.toString());
  }
  if (context.journal_name) {
    const { value: name } = context.journal_name;
    content = content.replaceAll("{{journal_name}}", name);
  }
  if (context.note_name) {
    const { value: name } = context.note_name;
    content = content.replaceAll("{{note_name}}", name).replaceAll("{{title}}", name);
  }
  const now = moment();
  const timeFormat = "HH:mm";
  content = content.replaceAll(
    /{{\s*(time|current_time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi,
    (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
      const templateVar = now.clone();
      if (calc) {
        templateVar.add(parseInt(timeDelta, 10), unit);
      }
      if (format) {
        return templateVar.format(format);
      }
      return templateVar.format(timeFormat);
    },
  );
  const dateFormat = "YYYY-MM-DD";
  content = content.replaceAll(
    /{{\s*(current_date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi,
    (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
      const templateVar = now.clone();
      if (calc) {
        templateVar.add(parseInt(timeDelta, 10), unit);
      }
      if (format) {
        return templateVar.format(format);
      }
      return templateVar.format(dateFormat);
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
  if (!supportsTemplaterCursor(app)) return;
  const templaterPlugin = app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null;
  if (!templaterPlugin) return false;
  await templaterPlugin.editor_handler.jump_to_next_cursor_location(note, true);
}

export async function tryApplyingTemplater(
  app: App,
  templateFile: TFile,
  note: TFile,
  content: string,
): Promise<string> {
  if (!canApplyTemplater(app, content)) return content;
  const templaterPlugin = app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null;
  if (!templaterPlugin) return "";
  try {
    const running_config = templaterPlugin.templater.create_running_config(
      templateFile,
      note,
      0, // RunMode.CreateNewFromTemplate
    );
    return await templaterPlugin.templater.parse_template(running_config, content);
  } catch (e) {
    console.error("Error applying templater", e);
  }
  return content;
}
