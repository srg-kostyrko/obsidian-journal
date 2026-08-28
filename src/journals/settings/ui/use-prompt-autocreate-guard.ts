import { watch, type Ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";

import { promptsInPath } from "../../prompts/prompts-in-path";

import type { JournalConfig } from "../../config";

// EditPromptModal refuses the opposite direction (adding a path-reaching prompt while
// autoCreate is on); this closes the loop for the toggle itself, which has no modal to
// validate through — a plain checkbox flip has no natural place to surface a blocking error.
export function usePromptAutocreateGuard(config: Ref<JournalConfig | undefined>): void {
  const notices = useService(NoticeService);
  watch(
    () => config.value?.autoCreate ?? false,
    (now, was) => {
      const current = config.value;
      if (!current || !now || was) return;
      if (promptsInPath(current).length > 0) {
        current.autoCreate = false;
        notices.show(m.journal_prompt_autocreate_conflict());
      }
    },
  );
}
