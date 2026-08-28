import { watch, type Ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";

import { promptsInPath } from "../../prompts/prompts-in-path";

import type { JournalConfig } from "../../config";

// Three edits can put a path-reaching question and autoCreate on the same journal: adding such
// a question, which EditPromptModal refuses outright; flipping the toggle on; and editing the
// name or folder template to start using a question while the toggle is already on. Neither of
// the latter two has a modal to validate through — a checkbox flip and a text field have no
// natural place to show a blocking error — so the conflict is undone here with a notice.
export function usePromptAutocreateGuard(config: Ref<JournalConfig | undefined>): void {
  const notices = useService(NoticeService);
  watch(
    () => {
      const current = config.value;
      return current
        ? {
            config: current,
            autoCreate: current.autoCreate,
            nameTemplate: current.nameTemplate,
            folder: current.folder,
          }
        : null;
    },
    (now, was) => {
      // Only an edit to the journal already on screen counts. Arriving at one that already
      // stores the conflict is navigation, not an edit, and rewriting its settings unasked is
      // not this guard's business.
      if (!now || was?.config !== now.config || !now.autoCreate) return;
      if (promptsInPath(now.config).length === 0) return;
      now.config.autoCreate = false;
      notices.show(m.journal_prompt_autocreate_conflict());
    },
  );
}
