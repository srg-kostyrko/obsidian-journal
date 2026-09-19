import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { apiModule } from "../module";

import { McpToolToken } from "./tool";
import { zod3Shape } from "./zod3-shape";

import type { McpTool } from "./tool";
import type { Client as ClientType } from "@modelcontextprotocol/sdk/client";
import type * as v from "valibot";

// Pins the same SDK 1.30 / host call shape zod3-shape.test.ts pins — see its comment for why.
async function connectedTools(): Promise<{ client: ClientType; tools: readonly McpTool[] }> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals: {}, shelves: {} },
  });
  const tools = harness.resolve(McpToolToken);

  const server = new McpServer({ name: "contract", version: "1.0.0" });
  for (const tool of tools) {
    // The host's exact call: name, description, raw shape, annotations, callback.
    server.tool(tool.name, tool.description, zod3Shape(tool.input), tool.annotations, async () => ({ content: [] }));
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "contract-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, tools };
}

function requiredKeys(entries: v.ObjectEntries): string[] {
  return Object.entries(entries)
    .filter(([, schema]) => schema.type !== "optional")
    .map(([key]) => key);
}

describe("MCP tools contract", () => {
  it("lists every registered tool with its input schema's required fields matching its non-optional entries", async () => {
    const { client, tools } = await connectedTools();

    const { tools: listed } = await client.listTools();

    expect(listed).toHaveLength(4);
    for (const tool of tools) {
      const advertised = listed.find((candidate) => candidate.name === tool.name);
      expect(advertised?.inputSchema.required ?? []).toEqual(requiredKeys(tool.input));
    }
  });

  it("keeps an optional field's description through the optional wrapping", async () => {
    const { client } = await connectedTools();

    const { tools } = await client.listTools();

    const journalNotes = tools.find((tool) => tool.name === "journal_notes");
    expect(journalNotes?.inputSchema.properties?.type).toMatchObject({
      description: "Only notelets of this type.",
    });
  });

  it("advertises journal_list with the SDK's empty object schema", async () => {
    const { client } = await connectedTools();

    const { tools } = await client.listTools();

    const journalList = tools.find((tool) => tool.name === "journal_list");
    expect(journalList?.inputSchema).toMatchObject({ type: "object", properties: {} });
  });

  it("advertises every tool as neither destructive nor open-world, which MCP otherwise assumes", async () => {
    const { client } = await connectedTools();

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(4);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ destructiveHint: false, openWorldHint: false });
    }
  });

  it("advertises each tool's read-only and idempotent hints", async () => {
    const { client } = await connectedTools();

    const { tools } = await client.listTools();

    expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]))).toEqual({
      journal_list: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      journal_notes: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      journal_note_ensure: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      journal_notelet_create: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    });
  });
});
