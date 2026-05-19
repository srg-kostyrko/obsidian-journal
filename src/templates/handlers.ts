import type { CalendarDate } from "@/calendar";
import { createMultiToken } from "@/infrastructure/di";
import type { Result } from "@/infrastructure/result";

import type { TemplateContext } from "./context";
import type { TemplateRenderError } from "./errors";

export interface FunctionInput {
  arg: string;
  sourceDate: CalendarDate;
  format?: string;
  ctx: TemplateContext;
  // engine: TemplateEngine is set by the engine at render-time; declared as unknown
  // here because engine.ts is created in Task 9. Task 9 tightens this to the real
  // type when engine.ts ships.
  engine: unknown;
}

export interface FunctionHandler {
  readonly name: string;
  render(input: FunctionInput): Result<string, TemplateRenderError>;
}

export const FunctionHandlerToken = createMultiToken<FunctionHandler>("templates.FunctionHandler");
