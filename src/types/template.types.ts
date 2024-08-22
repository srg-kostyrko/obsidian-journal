export type TemplateVariable =
  | {
      type: "string";
      value: string;
    }
  | {
      type: "number";
      value: number | undefined;
    }
  | {
      type: "date";
      value: string;
      defaultFormat: string;
    };

export type TemplateContext = Record<string, TemplateVariable>;
