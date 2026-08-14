import { watch, type Ref } from "vue";

import { useService } from "@/infrastructure/di";

import { NoteConnectionService } from "../../notes/note-connection";

import type { JournalConfig } from "../../config";

export function useReapplyFrontmatterOnToggle(config: Ref<JournalConfig | undefined>): void {
  const connection = useService(NoteConnectionService);
  watch(
    () =>
      [
        config.value?.name,
        config.value?.frontmatter.addStartDate ?? false,
        config.value?.frontmatter.addEndDate ?? false,
      ] as const,
    ([name, start, end], [wasName, wasStart, wasEnd]) => {
      // A name change means the ref switched to another journal; its flags differ
      // by identity, not by a user toggle — never rewrite notes for that.
      if (name === undefined || name !== wasName) return;
      if (start === wasStart && end === wasEnd) return;
      void connection.reapplyAll(name);
    },
  );
}
