import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import type { Prompt } from "@/journals/prompts/config";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";

import { EditPromptFlow } from "./edit-prompt.flow";

const moodPrompt: Prompt = {
  variable: "mood",
  question: "How do you feel?",
  type: "text",
  frontmatterKey: "journal-mood",
  required: false,
};

const journalWithMoodPrompt = fixedJournal("j", { type: "day" }, { prompts: [moodPrompt] });

const draft = (over: Partial<Prompt> = {}): Prompt => ({ ...moodPrompt, ...over }) as Prompt;

describe("EditPromptFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: { journals: { j: journalWithMoodPrompt } },
    });
  });

  it("appends a prompt when no prompt index is given", async () => {
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j" });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft({ variable: "sleep", frontmatterKey: "journal-sleep" }));
    const result = await promise;

    expect(result.isOk()).toBe(true);
    expect(
      harness
        .resolve(JournalsRepository)
        .get("j")
        .getOrUndefined()
        ?.prompts.map((p) => p.variable),
    ).toEqual(["mood", "sleep"]);
  });

  it("replaces the prompt at the given index", async () => {
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j", promptIndex: 0 });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft({ question: "How's the weather?" }));
    const result = await promise;

    expect(result.isOk()).toBe(true);
    const prompts = harness.resolve(JournalsRepository).get("j").getOrUndefined()?.prompts ?? [];
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.question).toBe("How's the weather?");
  });

  it("moves stored answers to the new key when the frontmatter key is renamed", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "j", "journal-date": "2026-06-01", "journal-mood": "happy" });
    harness.resolve(JournalsIndex).register({ journalName: "j", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j", promptIndex: 0 });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft({ frontmatterKey: "journal-feeling" }));
    await promise;

    expect(harness.host.files.get(path)?.frontmatter).toEqual({
      journal: "j",
      "journal-date": "2026-06-01",
      "journal-feeling": "happy",
    });
  });

  it("does not rename the property when the key is unchanged", async () => {
    const connection = harness.resolve(NoteConnectionService);
    const spy = vi.spyOn(connection, "renameFieldAll");
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j", promptIndex: 0 });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft());
    await promise;

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not rename anything when the key is cleared", async () => {
    const connection = harness.resolve(NoteConnectionService);
    const spy = vi.spyOn(connection, "renameFieldAll");
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j", promptIndex: 0 });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft({ frontmatterKey: "" }));
    await promise;

    expect(spy).not.toHaveBeenCalled();
  });

  it("returns the submitted prompt's variable on submit", async () => {
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j" });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft({ variable: "sleep", frontmatterKey: "journal-sleep" }));
    const result = await promise;

    expect(result.isOk() && result.value).toEqual({ variable: "sleep" });
  });

  it("returns UserAborted and leaves prompts unchanged when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j" });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(UserAborted);
    expect(
      harness
        .resolve(JournalsRepository)
        .get("j")
        .getOrUndefined()
        ?.prompts.map((p) => p.variable),
    ).toEqual(["mood"]);
  });

  it("errors for an unknown journal", async () => {
    harness = await testContainer({ modules: [journalsCoreModule, journalsSettingsCoreModule] });
    const result = await harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "missing" });

    expect(result.isErr()).toBe(true);
  });

  it("errors for a prompt index that does not exist", async () => {
    const result = await harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j", promptIndex: 9 });

    expect(result.isErr()).toBe(true);
  });
});

describe("EditPromptFlow addressing a notelet type", () => {
  const journalWithType = fixedJournal(
    "j",
    { type: "day" },
    {
      prompts: [moodPrompt],
      notelets: {
        nt_7f3a: buildNoteletType({
          id: "nt_7f3a" as TypeId,
          name: "Standup",
          prompts: [{ ...moodPrompt, variable: "attendee", frontmatterKey: "with" }],
        }),
      },
    },
  );

  it("appends a type prompt to the type, leaving the journal's prompts alone", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: { journals: { j: journalWithType } },
    });
    const promise = harness.resolve(Flows).invoke(EditPromptFlow, { journalName: "j", typeId: "nt_7f3a" });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft({ variable: "sleep", frontmatterKey: "journal-sleep" }));
    const result = await promise;

    expect(result.isOk()).toBe(true);
    const config = harness.resolve(JournalsRepository).get("j").getOrUndefined();
    expect(config?.notelets.nt_7f3a?.prompts.map((p) => p.variable)).toEqual(["attendee", "sleep"]);
    expect(config?.prompts.map((p) => p.variable)).toEqual(["mood"]);
  });

  it("does not rename fields when a type prompt's frontmatter key changes", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: { journals: { j: journalWithType } },
    });
    const connection = harness.resolve(NoteConnectionService);
    const spy = vi.spyOn(connection, "renameFieldAll");
    const promise = harness
      .resolve(Flows)
      .invoke(EditPromptFlow, { journalName: "j", typeId: "nt_7f3a", promptIndex: 0 });
    harness.modals.lastOpen<unknown, Prompt>().submit(draft({ variable: "attendee", frontmatterKey: "guest" }));
    await promise;

    expect(spy).not.toHaveBeenCalled();
    const config = harness.resolve(JournalsRepository).get("j").getOrUndefined();
    expect(config?.notelets.nt_7f3a?.prompts[0]?.frontmatterKey).toBe("guest");
  });
});
