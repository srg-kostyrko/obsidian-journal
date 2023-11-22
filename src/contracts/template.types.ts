import { MomentDate } from "./date.types";
export interface TemplateContext {
  date?: {
    value: MomentDate;
    defaultFormat: string;
  };
  start_date?: {
    value: MomentDate;
    defaultFormat: string;
  };
  end_date?: {
    value: MomentDate;
    defaultFormat: string;
  };
}
