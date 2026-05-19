import type { CalendarDate } from "@/calendar";
import { createMultiToken } from "@/infrastructure/di";
import type { Result } from "@/infrastructure/result";

import type { TemplateContext } from "./context";
import type { TemplateEngine } from "./engine";
import type { TemplateRenderError } from "./errors";

export interface FunctionInput {
  arg: string;
  sourceDate: CalendarDate;
  format?: string;
  ctx: TemplateContext;
  engine: TemplateEngine;
}

export interface FunctionHandler {
  readonly name: string;
  render(input: FunctionInput): Result<string, TemplateRenderError>;
}

export const FunctionHandlerToken = createMultiToken<FunctionHandler>("templates.FunctionHandler");
