import { watch, type Ref } from "vue";

import { useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";

import { AutoCreateService } from "../../notes/auto-create";
import { JournalDateFormatError } from "../../notes/errors";

import type { JournalConfig } from "../../config";

export function useAutoCreateOnEnable(config: Ref<JournalConfig | undefined>): void {
  const autoCreate = useService(AutoCreateService);
  const notices = useService(NoticeService);
  watch(
    () => config.value?.autoCreate ?? false,
    async (now, was) => {
      const current = config.value;
      if (!current || !now || was) return;
      // The user just asked for this note, so unlike the unattended tick a broken format is said aloud.
      const result = await autoCreate.createCurrent(current.name);
      if (result.isErr() && result.error instanceof JournalDateFormatError) notices.show(result.error.userNotice);
    },
  );
}
