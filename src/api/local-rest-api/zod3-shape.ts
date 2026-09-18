import * as v from "valibot";

import type { z } from "zod";

type Path = (string | number)[];

interface ParseContext {
  readonly common: { readonly issues: { code: "custom"; path: Path; message: string }[] };
}

interface ParseInput {
  readonly data: unknown;
  readonly path: Path;
  readonly parent: ParseContext;
}

type Schema = v.GenericSchema | v.GenericSchemaAsync;

/** Thrown when a tool's shape uses a valibot kind the adapter has no zod-3 layout for. */
export class UnmappedSchemaError extends Error {}

function issuePath(issue: v.BaseIssue<unknown>): Path {
  return (issue.path ?? []).map((item) => item.key as string | number);
}

// A forged zod-3 node: `_def` is what zod-to-json-schema reads, `_parse` is what the host's
// z.object calls per property, and parse/safeParse are what SDK 1.30 looks for to tell a raw
// shape from the annotations argument.
class ForgedNode {
  readonly #schema: v.GenericSchema;
  readonly _def: Record<string, unknown>;

  constructor(schema: v.GenericSchema, definition: Record<string, unknown>) {
    this.#schema = schema;
    this._def = definition;
  }

  _parse(input: ParseInput): { status: "valid"; value: unknown } | { status: "aborted" } {
    const result = v.safeParse(this.#schema, input.data);
    if (result.success) return { status: "valid", value: result.output };
    for (const issue of result.issues) {
      input.parent.common.issues.push({
        code: "custom",
        path: [...input.path, ...issuePath(issue)],
        message: issue.message,
      });
    }
    return { status: "aborted" };
  }

  parse(data: unknown): unknown {
    return v.parse(this.#schema, data);
  }

  safeParse(data: unknown) {
    const result = v.safeParse(this.#schema, data);
    return result.success
      ? { success: true as const, data: result.output }
      : {
          success: false as const,
          error: { issues: result.issues.map((issue) => ({ path: issuePath(issue), message: issue.message })) },
        };
  }

  isOptional(): boolean {
    return this._def.typeName === "ZodOptional";
  }
}

function forge(schema: Schema): ForgedNode {
  const description = v.getDescription(schema);
  const kind = schema.type;
  const base = schema as v.GenericSchema;
  switch (kind) {
    case "string": {
      return new ForgedNode(base, { typeName: "ZodString", checks: [], coerce: false, description });
    }
    case "unknown": {
      return new ForgedNode(base, { typeName: "ZodUnknown", description });
    }
    case "optional": {
      const inner = forge((schema as v.OptionalSchema<v.GenericSchema, undefined>).wrapped);
      return new ForgedNode(base, { typeName: "ZodOptional", innerType: inner, description });
    }
    case "record": {
      const record = schema as v.RecordSchema<v.GenericSchema<string>, v.GenericSchema, undefined>;
      return new ForgedNode(base, {
        typeName: "ZodRecord",
        keyType: forge(record.key),
        valueType: forge(record.value),
        description,
      });
    }
    default: {
      throw new UnmappedSchemaError(`No zod-3 layout for valibot schema kind "${kind}".`);
    }
  }
}

/** Builds the raw shape the host's `addMcpTool` takes from a tool's valibot entries. */
export function zod3Shape(entries: v.ObjectEntries): Record<string, z.ZodTypeAny> {
  return Object.fromEntries(
    Object.entries(entries).map(([key, schema]) => [key, forge(schema) as unknown as z.ZodTypeAny]),
  );
}
