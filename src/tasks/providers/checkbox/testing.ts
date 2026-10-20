import type { AnchorString } from "@/calendar";
import { NoteMetadataService, NoteStructureService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { overrideWith, testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";
import { TaskIndex } from "../../task-index";
import { TaskProviderToken } from "../../types";
import { TaskVisibility } from "../../visibility";

import { CHECKBOX_PROVIDER_ID } from "./extract";
import { CheckboxTaskProvider } from "./provider";

export interface CheckboxNoteFixture {
  readonly text: string;
  // One checkbox list item per line number, in `text`.
  readonly lines: readonly number[];
  readonly tags?: readonly { readonly line: number; readonly tag: string }[];
  readonly frontmatterTags?: readonly string[];
  readonly properties?: Record<string, unknown>;
  readonly owner?: { readonly journalName: string; readonly anchor: AnchorString };
}

// The checkbox provider started over the given notes, past boot and with its walk landed, so the
// index holds what a real walk published and the visibility answers from the journals' stored rules.
export async function startedCheckboxes(
  fixtures: Partial<Record<VaultPath, CheckboxNoteFixture>>,
  journals: Record<string, JournalConfig> = {},
) {
  const notes = new FakeNotesService();
  const structures = new FakeNoteStructureService();
  const metadata = new FakeNoteMetadataService();
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals },
    overrides: [
      overrideWith(NotesService, notes as never),
      overrideWith(NoteStructureService, structures as never),
      overrideWith(NoteMetadataService, metadata as never),
    ],
  });
  const index = harness.resolve(JournalsIndex);
  for (const [path, fixture] of Object.entries(fixtures) as [VaultPath, CheckboxNoteFixture][]) {
    const frontmatterTags = [...(fixture.frontmatterTags ?? [])];
    notes.seed(path, fixture.text);
    structures.setStructure(path, {
      listItems: fixture.lines.map((line) => ({ marker: " ", line, endLine: line, parent: null })),
      tags: [...(fixture.tags ?? [])],
      headings: [],
      frontmatterTags,
    });
    metadata.setMetadata(path, { title: path, tags: frontmatterTags, properties: fixture.properties ?? {} });
    if (fixture.owner !== undefined) index.register({ ...fixture.owner, path });
  }
  index.markReady();
  const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === CHECKBOX_PROVIDER_ID);
  if (!(provider instanceof CheckboxTaskProvider)) throw new TypeError("checkbox provider not registered");
  provider.start();
  await settle();
  return {
    tasks: harness.resolve(TaskIndex),
    visibility: harness.resolve(TaskVisibility),
    repository: harness.resolve(JournalsRepository),
    provider,
    notes,
    metadata,
  };
}

export function settle(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
