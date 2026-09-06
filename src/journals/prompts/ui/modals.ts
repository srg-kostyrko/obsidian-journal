import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import PromptAnswersModal from "./PromptAnswersModal.vue";

import type { JournalMetadata, NoteletMetadata } from "../../types";
import type { PromptAnswer } from "../config";

export interface PromptAnswersModalProps {
  metadata: JournalMetadata | NoteletMetadata;
  confirming: boolean;
  periodLabel: string;
  // A notelet is asked its questions through the same modal as its journal's period note, so
  // the title is the only thing that says which of the two is being created. It arrives as its
  // own prop because a title is resolved from props alone, with no journal config to read the
  // name off the metadata's type id.
  noteletTypeName?: string;
}

export const promptAnswersModal = defineModal<Record<string, PromptAnswer>>()({
  component: PromptAnswersModal,
  title: ({ metadata, noteletTypeName }: PromptAnswersModalProps) =>
    noteletTypeName === undefined
      ? m.journal_prompt_answers_modal_title({ journal: metadata.journalName })
      : m.journal_prompt_answers_notelet_modal_title({ journal: metadata.journalName, type: noteletTypeName }),
});
