import type { JournalName, ShelfName } from "@/types/journal.types";

import { ref, type Ref } from "vue";
import type { SettingsUiState as SettingsUiStateContract } from "./settings.types";
import { SettingsUiState as SettingsUiStateToken } from "./settings.tokens";
import { Injectable } from "@/infra/di/decorators/Injectable";

@Injectable(SettingsUiStateToken)
export class SettingsUiState implements SettingsUiStateContract {
  readonly selectedJournal: Ref<JournalName | null> = ref(null);
  readonly selectedShelf: Ref<ShelfName | null> = ref(null);
}
