import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { TaskIndex } from "@/tasks/task-index";
import { buildTaskItem } from "@/tasks/testing";

import { fakeRequest, restHarness } from "../testing";

const path = "/journals/:name/tasks/:date";
const NOTE = "2026-09-22.md" as VaultPath;

async function seeded() {
  const rest = await restHarness();
  rest.harness
    .resolve(JournalsIndex)
    .register({ journalName: "work", anchor: "2026-09-22" as AnchorString, path: NOTE });
  rest.harness.resolve(TaskIndex).publish("checkbox", { path: NOTE }, [
    buildTaskItem({
      path: NOTE,
      key: `${NOTE}:1`,
      display: { kind: "line", path: NOTE, line: 1, endLine: 1, parentLine: null, markdown: "- [ ] open one" },
    }),
    buildTaskItem({
      path: NOTE,
      key: `${NOTE}:2`,
      status: "done",
      display: { kind: "line", path: NOTE, line: 2, endLine: 2, parentLine: null, markdown: "- [x] done one" },
    }),
  ]);
  return rest;
}

describe("GET /journals/:name/tasks/:date", () => {
  it("answers the period's tasks", async () => {
    const { send } = await seeded();

    const response = await send("get", path, fakeRequest({ params: { name: "work", date: "2026-09-22" } }));

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      tasks: [
        {
          journal: "work",
          date: "2026-09-22",
          path: "2026-09-22.md",
          source: "note",
          line: 1,
          text: "- [ ] open one",
          status: "todo",
          dates: {},
          relations: ["containment"],
          parentLine: null,
        },
      ],
    });
  });

  it("passes source, depth and status through", async () => {
    const { api, send } = await seeded();
    const tasksFor = vi.spyOn(api, "tasksFor");

    const response = await send(
      "get",
      path,
      fakeRequest({
        params: { name: "work", date: "2026-09-22" },
        query: { source: "note", depth: "rollup", status: "done" },
      }),
    );

    expect(tasksFor).toHaveBeenCalledWith("work", "2026-09-22", { source: "note", depth: "rollup", status: "done" });
    expect(response.body).toMatchObject({ tasks: [{ line: 2 }] });
  });

  it("gives 400 invalid-request for a source or depth it does not know", async () => {
    const { api, send } = await seeded();
    const tasksFor = vi.spyOn(api, "tasksFor");

    const badSource = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-09-22" }, query: { source: "everything" } }),
    );
    const badDepth = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-09-22" }, query: { depth: "deep" } }),
    );

    expect([badSource.statusCode, badDepth.statusCode]).toEqual([400, 400]);
    expect(badSource.body).toMatchObject({ code: "invalid-request" });
    expect(tasksFor).not.toHaveBeenCalled();
  });

  it("passes a date relation through and refuses one it does not know", async () => {
    const { api, send } = await seeded();
    const tasksFor = vi.spyOn(api, "tasksFor");

    await send("get", path, fakeRequest({ params: { name: "work", date: "2026-09-22" }, query: { date: "due" } }));
    expect(tasksFor).toHaveBeenCalledWith("work", "2026-09-22", { date: "due" });

    tasksFor.mockClear();
    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-09-22" }, query: { date: "bogus" } }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ code: "invalid-request" });
    expect(tasksFor).not.toHaveBeenCalled();
  });

  it("gives 400 invalid-request when a query value arrives as an array", async () => {
    const { send } = await seeded();

    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-09-22" }, query: { status: ["open", "done"] } }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ code: "invalid-request" });
  });

  it("gives 404 for an unknown journal without reading any tasks", async () => {
    const { api, send } = await seeded();
    const tasksFor = vi.spyOn(api, "tasksFor");

    const response = await send("get", path, fakeRequest({ params: { name: "nope", date: "2026-09-22" } }));

    expect(response.statusCode).toBe(404);
    expect(tasksFor).not.toHaveBeenCalled();
  });
});
