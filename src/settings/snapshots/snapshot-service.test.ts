import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { SnapshotService } from "./snapshot-service";

function build(): { service: SnapshotService; data: FakePluginData } {
  const data = new FakePluginData();
  const c = new Container();
  c.register(PluginData).useValue(data as unknown as PluginData);
  c.register(SnapshotService).useClass(SnapshotService);
  return { service: c.resolve(SnapshotService), data };
}

describe("SnapshotService", () => {
  it("writes a snapshot under a name carrying its version and timestamp", async () => {
    const { service, data } = build();

    expectOk(await service.write(3, '{"version":3}', "2026-08-16T10:20:30.000Z"));

    expect([...data.files.keys()]).toEqual(["backup-v3-2026-08-16T10-20-30.json"]);
    expect(data.files.get("backup-v3-2026-08-16T10-20-30.json")).toBe('{"version":3}');
  });

  it("lists snapshots newest first, ignoring unrelated files", async () => {
    const { service, data } = build();
    data.files.set("data.json", "{}");
    data.files.set("backup-v3-2026-08-16T10-20-30.json", "{}");
    data.files.set("backup-v2-2026-07-01T09-00-00.json", "{}");

    const result = await service.list();

    expectOk(result);
    expect(result.value.map((s) => s.name)).toEqual([
      "backup-v3-2026-08-16T10-20-30.json",
      "backup-v2-2026-07-01T09-00-00.json",
    ]);
    expect(result.value.at(0)?.fromVersion).toBe(3);
    expect(result.value.at(0)?.takenAt).toBe("2026-08-16T10:20:30Z");
  });

  it("sorts by taken-at date rather than name, where a double-digit version would put a name sort out of order", async () => {
    // "v9" and "v10" are the case a name sort gets in the wrong order: comparing the
    // strings character-by-character hits "9" vs "1" before the date is even reached, so
    // "backup-v9-…" sorts as the larger string and would be listed first — even though the
    // v10 snapshot (versions only move forward) was taken years later.
    const { service, data } = build();
    data.files.set("backup-v9-2020-01-01T00-00-00.json", "{}");
    data.files.set("backup-v10-2026-08-16T10-20-30.json", "{}");

    const result = await service.list();

    expectOk(result);
    expect(result.value.map((s) => s.name)).toEqual([
      "backup-v10-2026-08-16T10-20-30.json",
      "backup-v9-2020-01-01T00-00-00.json",
    ]);
  });

  it("reads a snapshot back as an object", async () => {
    const { service, data } = build();
    data.files.set("backup-v3-2026-08-16T10-20-30.json", '{"version":3,"journals":{}}');

    const result = await service.read("backup-v3-2026-08-16T10-20-30.json");

    expectOk(result);
    expect(result.value).toEqual({ version: 3, journals: {} });
  });

  it("rejects a snapshot whose contents are not a JSON object", async () => {
    const { service, data } = build();
    data.files.set("backup-v3-2026-08-16T10-20-30.json", "not json");

    expectErr(await service.read("backup-v3-2026-08-16T10-20-30.json"));
  });

  it("rejects a snapshot holding a JSON array", async () => {
    const { service, data } = build();
    data.files.set("backup-v3-2026-08-16T10-20-30.json", "[1,2,3]");

    expectErr(await service.read("backup-v3-2026-08-16T10-20-30.json"));
  });
});
