import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Flows, FlowsModule, UserAborted } from "@/infrastructure/flows";
import { NoticeService, UriService } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsEventsToken,
  NoApplicableJournals,
  OpenDateFlow,
  journalConfigCollection,
} from "@/journals";
import type { JournalsEvents } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { JournalUriHandler } from "./journal-uri-handler";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function build() {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
  });
  await settings.initialize();

  const journalsStorage = settings.recordOf(journalConfigCollection);
  const journalsEvents = createNanoEvents<JournalsEvents>();
  const journalsRepo = JournalsRepository.fromParts(journalsStorage, journalsEvents);

  const host = createFakeHost();
  const notices = new FakeNoticeService();

  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(UriService).useClass(UriService);
  container.register(NoticeService).useValue(notices);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsEventsToken).useValue(journalsEvents);
  container.register(JournalsRepository).useValue(journalsRepo);
  container.addModule(FlowsModule);
  container.register(JournalUriHandler).useClass(JournalUriHandler);

  const flows = container.resolve(Flows);
  const handler = container.resolve(JournalUriHandler);
  handler.initialize();

  function trigger(parameters: Record<string, string>): void {
    host.emitProtocol("journals", { action: "journals", ...parameters });
  }

  return { host, journalsRepo, notices, flows, trigger };
}

describe("JournalUriHandler dispatch", () => {
  it("invokes OpenDateFlow for a named journal and ISO date", async () => {
    const { journalsRepo, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

    trigger({ journal: "daily", date: "2026-06-04", mode: "tab" });
    await flush();

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      {
        anchor: "2026-06-04",
        journalNames: ["daily"],
        openMode: "tab",
        existingOnly: false,
      },
      { notify: false },
    );
  });

  it("defaults to today when no date is given", async () => {
    const { journalsRepo, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

    trigger({ journal: "daily" });
    await flush();

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      {
        anchor: CalendarDate.today().toAnchor(),
        journalNames: ["daily"],
        openMode: "active",
        existingOnly: false,
      },
      { notify: false },
    );
  });

  it("passes every journal of a write type as candidates", async () => {
    const { journalsRepo, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.create("work", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

    trigger({ type: "day", date: "2026-06-04" });
    await flush();

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      {
        anchor: "2026-06-04",
        journalNames: ["daily", "work"],
        openMode: "active",
        existingOnly: false,
      },
      { notify: false },
    );
  });
});

describe("JournalUriHandler errors", () => {
  it("notifies and opens nothing for an unknown journal name", async () => {
    const { notices, flows, trigger } = await build();
    const invokeSpy = vi.spyOn(flows, "invoke");

    trigger({ journal: "missing" });
    await flush();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
  });

  it("notifies and opens nothing for a date that cannot be parsed", async () => {
    const { journalsRepo, notices, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke");

    trigger({ journal: "daily", date: "not-a-date" });
    await flush();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
  });

  it("notifies when no journal of the requested type exists", async () => {
    const { notices, flows, trigger } = await build();
    const invokeSpy = vi.spyOn(flows, "invoke");

    trigger({ type: "week" });
    await flush();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
    expect(notices.messages[0]).toContain("week");
  });

  it("notifies when the flow reports no applicable journals", async () => {
    const { journalsRepo, notices, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.err(new NoApplicableJournals(anchor("2026-06-04"))));

    trigger({ journal: "daily", date: "2026-06-04" });
    await flush();

    expect(notices.messages).toHaveLength(1);
  });

  it("stays silent when the journal picker is dismissed", async () => {
    const { journalsRepo, notices, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.err(new UserAborted("journal-picker")));

    trigger({ journal: "daily" });
    await flush();

    expect(notices.messages).toHaveLength(0);
  });
});
