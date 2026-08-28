import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import PromptAnswersModal from "./PromptAnswersModal.vue";

import type { PromptAnswer } from "../config";

export interface PromptAnswersModalProps {
  journalName: string;
  anchor: AnchorString;
  confirming: boolean;
}

export const promptAnswersModal = defineModal<Record<string, PromptAnswer>>()({
  component: PromptAnswersModal,
  title: (_: PromptAnswersModalProps) => m.journal_prompt_answers_modal_title(),
});
