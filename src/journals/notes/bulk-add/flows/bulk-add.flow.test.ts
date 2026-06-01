import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { BulkAddService } from "../bulk-add-service";
import { defaultBulkAddParameters } from "../config";

import { BulkAddFlow } from "./bulk-add.flow";

function build() {
  const c = new Container();
  c.addModule(LoggerModule);
  const service = { plan: vi.fn(() => AsyncResult.ok({ notes: [] })) };
  const modals = new FakeModalService();
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(BulkAddService).useValue(service as unknown as BulkAddService);
  c.register(Flows).useClass(Flows);
  c.register(BulkAddFlow).useClass(BulkAddFlow);
  return { flows: c.resolve(Flows), modals, service };
}

describe("BulkAddFlow", () => {
  it("plans with the configured parameters then opens the process modal", async () => {
    const { flows, modals, service } = build();
    const promise = flows.invoke(BulkAddFlow, { journalName: "daily" });
    modals.lastOpen().submit({ ...defaultBulkAddParameters(), folder: "src" });
    // flush microtask ticks: modal promise → mapErr → async-iter → plan AsyncResult → second open
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(service.plan).toHaveBeenCalledWith("daily", expect.objectContaining({ folder: "src" }));
    modals.lastOpen<unknown, void>().submit(undefined); // process modal closes (void submit)
    await promise;
  });

  it("aborts cleanly when the configure modal is cancelled", async () => {
    const { flows, modals, service } = build();
    const promise = flows.invoke(BulkAddFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(service.plan).not.toHaveBeenCalled();
  });
});
