<script setup lang="ts">
import { m } from "@/i18n";
import UiFileInput from "@/ui/UiFileInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { MarkdownTemplateConfig, MarkdownTemplateConfigChange } from "../markdown-template-block";

const props = defineProps<{ config: MarkdownTemplateConfig; onChange: MarkdownTemplateConfigChange }>();

const update = (patch: Partial<MarkdownTemplateConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_block_markdown_template_path_label() }}</template>
    <template #description>{{ m.view_block_markdown_template_variables_hint() }}</template>
    <UiFileInput
      :model-value="config.templatePath"
      :placeholder="m.view_block_markdown_template_path_placeholder()"
      @update:model-value="(value: string) => update({ templatePath: value })"
    />
  </UiSettingRow>
</template>
