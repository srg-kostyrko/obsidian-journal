<script setup lang="ts">
import type { HomeBlockConfig } from "@/code-blocks/home/home-config";
import HomeCodeBlock from "@/code-blocks/home/ui/HomeCodeBlock.vue";
import NavigationCodeBlock from "@/code-blocks/nav/ui/NavigationCodeBlock.vue";
import { timelineModes, type TimelineBlockConfig } from "@/code-blocks/timeline/timeline-config";
import TimelineCodeBlock from "@/code-blocks/timeline/ui/TimelineCodeBlock.vue";
import { m } from "@/i18n";

import CodeBlockSnippet from "./CodeBlockSnippet.vue";
import { useCodeBlockPreviewPath } from "./use-code-block-preview-path";

const props = defineProps<{ journalName: string }>();

const previewPath = useCodeBlockPreviewPath(props.journalName);

const navConfig: Record<string, never> = {};
const timelineConfig: TimelineBlockConfig = {};
const defaultHomeConfig: HomeBlockConfig = { show: ["day"], separator: " • ", scale: 1 };
const customHomeConfig: HomeBlockConfig = { show: ["day", "month"], separator: " | ", scale: 2 };
const customHomeBody = `show:\n  - day\n  - month\nscale: 2\nseparator: " | "`;
</script>

<template>
  <div class="code-block-reference">
    <p class="code-block-reference__hint">{{ m.journal_edit_code_block_copy_hint() }}</p>

    <section class="code-block-reference__section">
      <CodeBlockSnippet name="journal-nav" />
      <p>{{ m.journal_edit_code_block_nav_description() }}</p>
      <p>{{ m.journal_edit_code_block_nav_current({ name: journalName }) }}</p>
      <NavigationCodeBlock :path="previewPath" :config="navConfig" />
      <p>
        {{ m.journal_edit_code_block_nav_aliases_lead() }}
        <code>calendar-nav</code>, <code>interval-nav</code>
      </p>
    </section>

    <section class="code-block-reference__section">
      <CodeBlockSnippet name="calendar-timeline" />
      <p>{{ m.journal_edit_code_block_timeline_description() }}</p>
      <p>{{ m.journal_edit_code_block_timeline_default({ name: journalName }) }}</p>
      <TimelineCodeBlock :path="previewPath" :config="timelineConfig" />
      <p>{{ m.journal_edit_code_block_timeline_options_lead() }}</p>
      <ul>
        <li><code>mode</code> — {{ m.journal_edit_code_block_timeline_option_mode() }}</li>
        <li><code>shelf</code> — {{ m.journal_edit_code_block_timeline_option_shelf() }}</li>
        <li><code>weeks</code> — {{ m.journal_edit_code_block_timeline_weeks() }}</li>
        <li><code>hiddenWeekdays</code> — {{ m.journal_edit_code_block_timeline_hidden_weekdays() }}</li>
        <li><code>before</code> — {{ m.journal_edit_code_block_timeline_option_before() }}</li>
        <li><code>after</code> — {{ m.journal_edit_code_block_timeline_option_after() }}</li>
      </ul>
      <p>{{ m.journal_edit_code_block_timeline_mode_lead() }}</p>
      <CodeBlockSnippet name="calendar-timeline" body="mode: month" />
      <p>{{ m.journal_edit_code_block_timeline_modes_lead() }}</p>
      <ul>
        <li v-for="mode in timelineModes" :key="mode">
          <code>{{ mode }}</code>
        </li>
      </ul>
    </section>

    <section class="code-block-reference__section">
      <CodeBlockSnippet name="journals-home" />
      <p>{{ m.journal_edit_code_block_home_description() }}</p>
      <p>{{ m.journal_edit_code_block_home_default() }}</p>
      <HomeCodeBlock :path="previewPath" :config="defaultHomeConfig" />
      <p>{{ m.journal_edit_code_block_home_options_lead() }}</p>
      <ul>
        <li><code>show</code> — {{ m.journal_edit_code_block_home_option_show() }}</li>
        <li><code>separator</code> — {{ m.journal_edit_code_block_home_option_separator() }}</li>
        <li><code>scale</code> — {{ m.journal_edit_code_block_home_option_scale() }}</li>
        <li><code>shelf</code> — {{ m.journal_edit_code_block_home_option_shelf() }}</li>
      </ul>
      <p>{{ m.journal_edit_code_block_home_custom_lead() }}</p>
      <CodeBlockSnippet name="journals-home" :body="customHomeBody" />
      <HomeCodeBlock :path="previewPath" :config="customHomeConfig" />
    </section>
  </div>
</template>

<style scoped>
.code-block-reference__hint {
  color: var(--text-accent);
}
.code-block-reference__section {
  padding-bottom: var(--size-4-2);
  margin-bottom: var(--size-4-2);
  border-bottom: var(--modal-border-width) solid var(--modal-border-color);
}
.code-block-reference__section:last-child {
  border-bottom: none;
}
</style>
