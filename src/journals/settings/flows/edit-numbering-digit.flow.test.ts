import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Flows } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsRepository, journalDefaultsFor, type JournalConfig, type JournalsEvents } from "@/journals";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { createSettingsService } from "@/settings/testing";

import { EditNumberingDigitFlow } from "./edit-numbering-digit.flow";

import type { NumberingDigitDraft } from "../ui/modals";

function configWithDigits(name: string, variables: readonly string[]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return {
    ...base,
    numbering: {
      ...base.numbering,
      enabled: true,
      sources: variables.map((variable, i) => ({
        variable,
        frontmatterKey: `journal-${variable}`,
        anchorValue: 1,
        reset: i === 0 ? ({ kind: "never" } as const) : ({ kind: "after", count: 6 } as const),
      })),
    },
  };
}

async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  const connection = { renameFieldAll: vi.fn(() => AsyncResult.ok()) };
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(EditNumberingDigitFlow).useClass(EditNumberingDigitFlow);
  return { storage, repo, modals, connection, flows: container.resolve(Flows) };
}

const draft = (over: Partial<NumberingDigitDraft> = {}): NumberingDigitDraft => ({
  variable: "sprint",
  frontmatterKey: "journal-sprint",
  anchorValue: 1,
  reset: { kind: "after", count: 6 },
  ...over,
});

describe("EditNumberingDigitFlow", () => {
  it("appends a digit when no source index is given", async () => {
    const { flows, modals, repo } = await build({ j: configWithDigits("j", ["index"]) });
    const promise = flows.invoke(EditNumberingDigitFlow, { journalName: "j" });
    modals.lastOpen<unknown, NumberingDigitDraft>().submit(draft());
    const result = await promise;

    expect(result.isOk()).toBe(true);
    expect(
      repo
        .get("j")
        .getOrUndefined()
        ?.numbering.sources.map((s) => s.variable),
    ).toEqual(["index", "sprint"]);
  });

  it("replaces the digit at the given index", async () => {
    const { flows, modals, repo } = await build({ j: configWithDigits("j", ["index"]) });
    const promise = flows.invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 0 });
    modals
      .lastOpen<unknown, NumberingDigitDraft>()
      .submit(draft({ variable: "release", frontmatterKey: "journal-index", reset: { kind: "never" } }));
    const result = await promise;

    expect(result.isOk()).toBe(true);
    const sources = repo.get("j").getOrUndefined()?.numbering.sources ?? [];
    expect(sources[0]?.variable).toBe("release");
    expect(sources).toHaveLength(1);
  });

  it("moves the stored value across when the property key changes", async () => {
    const { flows, modals, connection } = await build({ j: configWithDigits("j", ["index"]) });
    const promise = flows.invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 0 });
    modals
      .lastOpen<unknown, NumberingDigitDraft>()
      .submit(draft({ variable: "release", frontmatterKey: "journal-release", reset: { kind: "never" } }));
    await promise;

    expect(connection.renameFieldAll).toHaveBeenCalledWith("j", "journal-index", "journal-release");
  });

  it("does not rename the property when the key is unchanged", async () => {
    const { flows, modals, connection } = await build({ j: configWithDigits("j", ["index"]) });
    const promise = flows.invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 0 });
    modals
      .lastOpen<unknown, NumberingDigitDraft>()
      .submit(draft({ variable: "release", frontmatterKey: "journal-index", reset: { kind: "never" } }));
    await promise;

    expect(connection.renameFieldAll).not.toHaveBeenCalled();
  });

  it("errors for an unknown journal", async () => {
    const { flows } = await build();
    const result = await flows.invoke(EditNumberingDigitFlow, { journalName: "missing" });

    expect(result.isErr()).toBe(true);
  });

  it("errors for a source index that does not exist", async () => {
    const { flows } = await build({ j: configWithDigits("j", ["index"]) });
    const result = await flows.invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 9 });

    expect(result.isErr()).toBe(true);
  });
});
