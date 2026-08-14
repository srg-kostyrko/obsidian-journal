import { watch, type Ref } from "vue";

import { useService } from "@/infrastructure/di";

import { AutoCreateService } from "../../notes/auto-create";

import type { JournalConfig } from "../../config";

export function useAutoCreateOnEnable(config: Ref<JournalConfig | undefined>): void {
  const autoCreate = useService(AutoCreateService);
  watch(
    () => config.value?.autoCreate ?? false,
    (now, was) => {
      const current = config.value;
      if (current && now && !was) void autoCreate.createCurrent(current.name);
    },
  );
}
