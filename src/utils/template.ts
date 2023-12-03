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
  if (context.name) {
    const { value: name } = context.name;
    content = content.replaceAll("{{name}}", name);
  }
  return content;
}
