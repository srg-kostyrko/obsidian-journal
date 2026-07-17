import { createNanoEvents } from "nanoevents";
import { shallowRef, type ShallowRef } from "vue";

import { DecorationEngine } from "@/decorations";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import {
  NoteMetadataService,
  NoticeService,
  NotesService,
  WorkspaceService,
  type NotesEvents,
} from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoticeService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  TimelineService,
  type JournalConfig,
} from "@/journals";
import { fakeRepo } from "@/journals/testing";
import { ShelvesRepository, type ShelfConfig } from "@/shelves";
import { fakeShelvesRepo } from "@/shelves/testing";

import { ActiveEntryViewModel, type ActiveEntryRef } from "./active-entry";

export class FakeActiveEntryViewModel implements Pick<ActiveEntryViewModel, "active"> {
  readonly active: ShallowRef<ActiveEntryRef | null> = shallowRef(null);

  setActive(ref: ActiveEntryRef | null): void {
    this.active.value = ref;
  }
}

export interface NotesCalendarHarness {
  readonly container: Container;
  readonly index: JournalsIndex;
  readonly workspace: FakeWorkspaceService;
  readonly metadata: FakeNoteMetadataService;
  readonly active: FakeActiveEntryViewModel;
}

export function buildNotesCalendarHarness(options: {
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
}): NotesCalendarHarness {
  const container = new Container();
  container.addModule(LoggerModule);
  container.addModule(FlowsModule);
  container.register(NoticeService).useValue(new FakeNoticeService());

  container.register(JournalsRepository).useValue(fakeRepo(options.journals ?? {}));
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  container.register(ShelvesRepository).useValue(fakeShelvesRepo(options.shelves));

  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(JournalsIndex).useClass(JournalsIndex);

  const workspace = new FakeWorkspaceService();
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);

  const metadata = new FakeNoteMetadataService();
  container.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);

  container.register(DecorationEngine).useClass(DecorationEngine);

  const active = new FakeActiveEntryViewModel();
  container.register(ActiveEntryViewModel).useValue(active as unknown as ActiveEntryViewModel);

  const index = container.resolve(JournalsIndex);

  return { container, index, workspace, metadata, active };
}
