import { type TFile, type App } from "obsidian";
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
