import { MomentDate } from "./date.types";
export interface TemplateContext {
  journal_name?: {
    value: string;
  };
  note_name?: {
    value: string;
  };
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
  index?: {
    value: number;
  };
}
