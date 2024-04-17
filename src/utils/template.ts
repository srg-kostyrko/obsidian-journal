import { App, TFile } from "obsidian";
import { TemplateContext } from "../contracts/template.types";
import { TemplaterPlugin } from "../contracts/templater.types";

export function replaceTemplateVariables(template: string, context: TemplateContext): string {
  let content = template ?? "";
  if (context.date) {
    const { value: date, defaultFormat } = context.date;
    content = content
    .replaceAll(/{{\s*(date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi, (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
      const templateVar = date.clone();
      if (calc) {
        templateVar.add(parseInt(timeDelta, 10), unit);
      }
      if(format) {
        return templateVar.format(format);
      }
      return templateVar.format(defaultFormat);
    });
  }

  if (context.start_date) {
    const { value: start_date, defaultFormat } = context.start_date;
    content = content
    .replaceAll(/{{\s*(start_date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi, (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
      const templateVar = start_date.clone();
      if (calc) {
        templateVar.add(parseInt(timeDelta, 10), unit);
      }
      if(format) {
        return templateVar.format(format);
      }
      return templateVar.format(defaultFormat);
    });
  }

  if (context.end_date) {
    const { value: end_date, defaultFormat } = context.end_date;
    content = content
    .replaceAll(/{{\s*(end_date)\s*(([+-]\d+)([yqmwdhs]))?\s*(:(.*?))?}}/gi, (_, _variableName, calc, timeDelta, unit, _customFormat, format) => {
      const templateVar = end_date.clone();
      if (calc) {
        templateVar.add(parseInt(timeDelta, 10), unit);
      }
      if(format) {
        return templateVar.format(format);
      }
      return templateVar.format(defaultFormat);
    });
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
    content = content.replaceAll("{{note_name}}", name);
  }
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
