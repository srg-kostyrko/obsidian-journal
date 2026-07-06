import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import MarkdownTemplateVariablesModal from "./MarkdownTemplateVariablesModal.vue";

export const markdownTemplateVariablesModal = defineModal()({
  component: MarkdownTemplateVariablesModal,
  title: () => m.view_block_markdown_template_variables_modal_title(),
});
