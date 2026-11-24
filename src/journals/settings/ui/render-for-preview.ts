import { Ok, type Result } from "@/infrastructure/result";
import { tokenize, type TemplateContext, type TemplateEngine, type UnrenderableDateFormatError } from "@/templates";

export function renderForPreview(
  engine: TemplateEngine,
  template: string,
  context: TemplateContext,
): Result<string, UnrenderableDateFormatError> {
  if (!template) return new Ok("");
  // renderStream does not throw on unknown variables — it emits the raw token
  // text (e.g. "{{unknown_var}}"). validate() is the only way to detect them.
  const stream = tokenize(template);
  const problems = engine.validate(stream, context, { allowFunctions: true });
  if (problems.length > 0) return new Ok("");
  return engine.renderStream(stream, context);
}
