import { computed, type ComputedRef, type Ref } from "vue";

import { useService } from "@/infrastructure/di";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../../cycle";
import { invertibilityOf, type InvertibilityWarning } from "../../notes/invertibility";
import { NotePathService } from "../../notes/note-path";

import type { JournalConfig } from "../../config";

export function useInvertibilityCheck(
  config: Ref<JournalConfig | undefined>,
): ComputedRef<InvertibilityWarning | null> {
  const services = {
    engine: useService(TemplateEngine),
    cycle: useService(CycleService),
    paths: useService(NotePathService),
  };
  return computed(() => (config.value ? invertibilityOf(config.value, services) : null));
}
