import { TemplateContext } from "../contracts/template.types";

export function replaceTemplateVariables(template: string, context: TemplateContext): string {
  let content = template;
  if (context.date) {
    const { value: date, defaultFormat } = context.date;
    content = content
      .replaceAll("{{date}}", date.format(defaultFormat))
      .replaceAll(/\{\{date:(.*?)\}\}/g, (_, format) => {
        return date.format(format);
      });
  }
  return content;
}
