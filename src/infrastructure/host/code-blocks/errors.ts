export class CodeBlockYamlError extends Error {
  readonly kind = "code-block-yaml" as const;

  constructor(readonly cause: unknown) {
    super("Failed to parse code block YAML");
    this.name = "CodeBlockYamlError";
  }
}
