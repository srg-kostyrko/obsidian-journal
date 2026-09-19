import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { UnmappedSchemaError, zod3Shape } from "./zod3-shape";

// Pins: zod 3.25.76 and zod-to-json-schema 3.25.2 are what obsidian-local-rest-api 5.1.0 bundles,
// and SDK 1.30.0 is the MCP server it registers tools on. Unreleased host main (SDK v2) wraps the
// same shape in z.object and converts with the same options (src/mcpSchema.ts, toStandardSchema,
// 05abe0d3), which the "~standard" case below covers. Move these pins when the host moves its own.
const entries = {
  journal: v.pipe(v.string(), v.description("Journal name.")),
  to: v.optional(v.pipe(v.string(), v.description("Last day, inclusive."))),
  answers: v.optional(v.pipe(v.record(v.string(), v.unknown()), v.description("Answers by variable."))),
};

function hostObject() {
  return z.object(zod3Shape(entries));
}

async function connect(received: Record<string, unknown>[]) {
  const server = new McpServer({ name: "contract", version: "1.0.0" });
  // The host's exact call: name, description, raw shape, annotations, callback.
  server.tool("probe", "Probe tool.", zod3Shape(entries), { readOnlyHint: true }, (toolArguments) => {
    received.push(toolArguments);
    return { content: [{ type: "text", text: "ok" }] };
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "contract-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("zod3Shape", () => {
  it("converts to the JSON Schema the host advertises", () => {
    const json = zodToJsonSchema(hostObject(), { strictUnions: true, pipeStrategy: "input" });
    expect(json).toMatchObject({
      type: "object",
      properties: {
        journal: { type: "string", description: "Journal name." },
        to: { type: "string", description: "Last day, inclusive." },
        answers: { type: "object", additionalProperties: {}, description: "Answers by variable." },
      },
      required: ["journal"],
    });
  });

  it("passes a valid call through with valibot's output", async () => {
    const result = await hostObject().safeParseAsync({ journal: "work", answers: { mood: 3 } });
    expect(result).toEqual({ success: true, data: { journal: "work", answers: { mood: 3 } } });
  });

  it("hands on valibot's output rather than the raw input", async () => {
    const trimmed = z.object(zod3Shape({ journal: v.pipe(v.string(), v.trim()) }));
    expect(await trimmed.safeParseAsync({ journal: "  work " })).toEqual({ success: true, data: { journal: "work" } });
  });

  it("reports valibot's issue with the field path for an invalid call", async () => {
    const result = await hostObject().safeParseAsync({ journal: 7 });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["journal"], message: expect.stringContaining("string") as unknown }),
    ]);
  });

  it("validates through zod's standard-schema surface", async () => {
    const standard = hostObject()["~standard"];
    expect(await standard.validate({ journal: "work" })).toEqual({ value: { journal: "work" } });
    const failed = await standard.validate({});
    expect("issues" in failed && failed.issues?.[0]?.path).toEqual(["journal"]);
  });

  it("throws when the shape is built for a kind it does not map", () => {
    expect(() => zod3Shape({ n: v.number() })).toThrow(UnmappedSchemaError);
  });

  it("throws when the shape is built for an async schema of a mapped kind", () => {
    const asyncEntry = v.pipeAsync(v.string()) as unknown as v.GenericSchema;
    expect(() => zod3Shape({ journal: asyncEntry })).toThrow(UnmappedSchemaError);
  });

  it("leaves an entry that accepts undefined out of the required list", () => {
    const json = zodToJsonSchema(z.object(zod3Shape({ journal: v.string(), extra: v.unknown() })), {
      strictUnions: true,
      pipeStrategy: "input",
    });
    expect(json).toMatchObject({ required: ["journal"] });
  });

  describe("on the MCP SDK the host registers tools with", () => {
    it("lists the tool with its input schema, not as an argument-less tool", async () => {
      const client = await connect([]);
      const { tools } = await client.listTools();
      expect(tools[0]).toMatchObject({
        name: "probe",
        annotations: { readOnlyHint: true },
        inputSchema: { type: "object", required: ["journal"], properties: { journal: { type: "string" } } },
      });
    });

    it("hands the callback the validated arguments", async () => {
      const received: Record<string, unknown>[] = [];
      const client = await connect(received);
      await client.callTool({ name: "probe", arguments: { journal: "work", to: "2026-09-30" } });
      expect(received).toEqual([{ journal: "work", to: "2026-09-30" }]);
    });

    it("refuses an invalid call without reaching the callback, naming the field", async () => {
      const received: Record<string, unknown>[] = [];
      const client = await connect(received);
      const outcome = await client
        .callTool({ name: "probe", arguments: { journal: 7 } })
        .then((result) => JSON.stringify(result), String);
      expect(received).toEqual([]);
      expect(outcome).toContain("journal");
    });
  });
});
