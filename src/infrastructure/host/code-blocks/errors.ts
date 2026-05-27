import type { BaseIssue } from "valibot";

export class CodeBlockYamlError extends Error {
  readonly kind = "code-block-yaml" as const;

  constructor(readonly cause: unknown) {
    super("Failed to parse code block YAML");
    this.name = "CodeBlockYamlError";
  }
}

export class CodeBlockSchemaError extends Error {
  readonly kind = "code-block-schema" as const;

  constructor(
    readonly key: string,
    readonly issues: readonly BaseIssue<unknown>[],
  ) {
    super(`Code block "${key}" failed schema validation`);
    this.name = "CodeBlockSchemaError";
  }
}
