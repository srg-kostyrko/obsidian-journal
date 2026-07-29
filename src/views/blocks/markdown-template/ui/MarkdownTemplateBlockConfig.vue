<script setup lang="ts">
import { m } from "@/i18n";
import { useModalService } from "@/infrastructure/host/modals";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTemplateInput from "@/ui/UiTemplateInput.vue";

import { markdownTemplateVariablesModal } from "./modals";

import type { MarkdownTemplateConfig, MarkdownTemplateConfigChange } from "../markdown-template-block";

const props = defineProps<{ config: MarkdownTemplateConfig; onChange: MarkdownTemplateConfigChange }>();

const modals = useModalService();

const update = (patch: Partial<MarkdownTemplateConfig>): void => props.onChange({ ...props.config, ...patch });

function showVariables(event: Event): void {
  event.preventDefault();
  void modals.open(markdownTemplateVariablesModal, {});
}
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_markdown_template_path_label() }}</template>
    <template #description>
      <a href="#" @click="showVariables">{{ m.view_block_markdown_template_variables_link() }}</a>
    </template>
    <UiTemplateInput
      :model-value="config.templatePath"
      :placeholder="m.view_block_markdown_template_path_placeholder()"
      @update:model-value="(value: string) => update({ templatePath: value })"
    />
  </UiSettingRow>
</template>
