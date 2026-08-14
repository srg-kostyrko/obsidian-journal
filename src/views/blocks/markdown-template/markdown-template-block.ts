import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";

import MarkdownTemplateBlock from "./ui/MarkdownTemplateBlock.vue";
import MarkdownTemplateBlockConfig from "./ui/MarkdownTemplateBlockConfig.vue";

const schema = v.object({ templatePath: v.optional(v.string(), "") });

export type MarkdownTemplateConfig = v.InferOutput<typeof schema>;
export type MarkdownTemplateConfigChange = (next: MarkdownTemplateConfig) => void;

export const markdownTemplateBlock = defineViewBlock<MarkdownTemplateConfig>({
  key: "markdown-template",
  label: () => m.view_block_markdown_template_label(),
  description: () => m.view_block_markdown_template_description(),
  icon: icons.block.markdownTemplate,
  schema,
  defaultConfig: { templatePath: "" },
  component: MarkdownTemplateBlock,
  configComponent: MarkdownTemplateBlockConfig,
  summary: (config) => config.templatePath || m.view_block_markdown_template_empty(),
});
