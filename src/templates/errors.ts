import type { BoundValue } from "./types";

export class TemplatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type TemplateParseErrorDetail =
  | { kind: "no-match"; input: string }
  | { kind: "invalid-number"; capture: string; varName: string }
  | { kind: "invalid-date"; capture: string; varName: string; format: string }
  | { kind: "conflict"; varName: string; candidates: BoundValue[] }
  | { kind: "not-invertible"; reason: "function-token" | "unknown-variable"; offending: string };

export class TemplateParseError extends TemplatesError {
  constructor(readonly detail: TemplateParseErrorDetail) {
    super(formatParseError(detail));
  }
}

export class TemplateRenderError extends TemplatesError {
  constructor(
    readonly reason: string,
    readonly cause?: unknown,
  ) {
    super(reason);
  }
}

function formatParseError(detail: TemplateParseErrorDetail): string {
  switch (detail.kind) {
    case "no-match": {
      return `Template did not match input: ${detail.input}`;
    }

    case "invalid-number": {
      return `Variable ${detail.varName}: cannot parse "${detail.capture}" as number`;
    }

    case "invalid-date": {
      return `Variable ${detail.varName}: cannot parse "${detail.capture}" with format "${detail.format}"`;
    }

    case "conflict": {
      return `Variable ${detail.varName}: conflicting captures`;
    }

    case "not-invertible": {
      return `Template is not invertible (${detail.reason}: ${detail.offending})`;
    }
  }
}
