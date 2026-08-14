import { createNanoEvents } from "nanoevents";
import { shallowRef, type ShallowRef } from "vue";

import { DecorationEngine, decorationsSlice, DecorationsStore } from "@/decorations";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import {
  NoteMetadataService,
  NoticeService,
  NotesService,
  PluginData,
  WorkspaceService,
  type NotesEvents,
} from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  FakeNoteMetadataService,
  FakeNoticeService,
  FakePluginData,
  FakeWorkspaceService,
} from "@/infrastructure/host/testing";
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
import { SettingsEventsToken, SettingsService, SliceDefinitionToken, type SettingsEvents } from "@/settings";
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
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);

  const metadata = new FakeNoteMetadataService();
  container.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);

  container.register(DecorationEngine).useClass(DecorationEngine);

  // DecorationsStore reads the vault-wide list unconditionally once a surface opts in via
  // calendarDecorations, so its settings backing must exist even for tests never touching it.
  container.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
  container.register(SliceDefinitionToken).useValue(decorationsSlice);
  container.register(SettingsEventsToken).useValue(createNanoEvents<SettingsEvents>());
  container.register(SettingsService).useClass(SettingsService);
  container.resolve(SettingsService).getSlice(decorationsSlice).state = { decorations: [] };
  container.register(DecorationsStore).useClass(DecorationsStore);

  const active = new FakeActiveEntryViewModel();
  container.register(ActiveEntryViewModel).useValue(active as unknown as ActiveEntryViewModel);

  const index = container.resolve(JournalsIndex);

  return { container, index, workspace, metadata, active };
}
