import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import PromptAnswersModal from "./PromptAnswersModal.vue";

import type { JournalMetadata } from "../../types";
import type { PromptAnswer } from "../config";

export interface PromptAnswersModalProps {
  metadata: JournalMetadata;
  confirming: boolean;
  periodLabel: string;
}

export const promptAnswersModal = defineModal<Record<string, PromptAnswer>>()({
  component: PromptAnswersModal,
  title: ({ metadata }: PromptAnswersModalProps) =>
    m.journal_prompt_answers_modal_title({ journal: metadata.journalName }),
});
