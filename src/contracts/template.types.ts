import { moment } from "obsidian";
export interface TemplateContext {
  date?: {
    value: ReturnType<typeof moment>;
    defaultFormat: string;
  };
}
