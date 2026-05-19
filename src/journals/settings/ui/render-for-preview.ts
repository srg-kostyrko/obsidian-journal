import { tokenize, type TemplateContext, type TemplateEngine } from "@/templates";

export function renderForPreview(engine: TemplateEngine, template: string, context: TemplateContext): string {
  if (!template) return "";
  const stream = tokenize(template);
  const problems = engine.validate(stream, context, { allowFunctions: true });
  if (problems.length > 0) return "";
  return engine.renderStream(stream, context);
}
