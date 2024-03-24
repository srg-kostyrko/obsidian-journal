import { App, TFile } from "obsidian";
import { TemplateContext } from "../contracts/template.types";
import { TemplaterPlugin } from "../contracts/templater.types";

export function replaceTemplateVariables(template: string, context: TemplateContext): string {
  let content = template ?? "";
  if (context.date) {
    const { value: date, defaultFormat } = context.date;
    content = content
      .replaceAll("{{date}}", date.format(defaultFormat))
      .replaceAll(/\{\{date:(.*?)\}\}/g, (_, format) => {
        return date.format(format);
      });
  }
  if (context.start_date) {
    const { value: start_date, defaultFormat } = context.start_date;
    content = content
      .replaceAll("{{start_date}}", start_date.format(defaultFormat))
      .replaceAll(/\{\{start_date:(.*?)\}\}/g, (_, format) => {
        return start_date.format(format);
      });
  }
  if (context.end_date) {
    const { value: end_date, defaultFormat } = context.end_date;
    content = content
      .replaceAll("{{end_date}}", end_date.format(defaultFormat))
      .replaceAll(/\{\{end_date:(.*?)\}\}/g, (_, format) => {
        return end_date.format(format);
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
