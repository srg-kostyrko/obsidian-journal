import { MomentDate } from "./date.types";
export interface TemplateContext {
  date?: {
    value: MomentDate;
    defaultFormat: string;
  };
}
