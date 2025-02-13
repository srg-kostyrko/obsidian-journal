<script setup lang="ts">
import type { JournalSettings } from "@/types/settings.types";
import DisplayCodeBlock from "../DisplayCodeBlock.vue";
import NavigationCodeBlock from "@/code-blocks/navigation/NavigationCodeBlock.vue";
import TimelineCodeBlock from "@/code-blocks/timeline/TimelineCodeBlock.vue";
import HomeCodeBlock from "@/code-blocks/home/HomeCodeBlock.vue";
import BlockDivider from "../BlockDivider.vue";
import { useFakePathData } from "@/composables/use-fake-path-data";
import { timelineModes } from "@/code-blocks/timeline/timeline.types";

const { journalName } = defineProps<{
  type: JournalSettings["write"]["type"];
  journalName: string;
}>();

const path = useFakePathData(journalName);
const customHomeSettings = `show: 
  - day 
  - month
scale: 2
separator: " | "`;
</script>

<template>
  <div>
    <p class="hint">Click on a code block to copy it to your clipboard.</p>
    <DisplayCodeBlock name="journal-nav" />
    <p>Navigation code block helps navigating relative to current note.</p>
    <p>
      It is fully customizable on journal level.<br />
      Current fonfiguration for {{ journalName }} journal looks like this:
    </p>
    <BlockDivider />
    <NavigationCodeBlock :path />
    <BlockDivider />
    <p>
      Plugin still supports older code blocks <code>calendar-nav</code> and <code>journal-nav</code> that function just
      as aliasses to <code>journal-nav</code>.
    </p>
    <BlockDivider />
    <DisplayCodeBlock name="calendar-timeline" />
    <p>Timeline code block helps navigating within bigger time periods.</p>
    <p>Default timeline for {{ journalName }} journal looks like this:</p>
    <BlockDivider />
    <TimelineCodeBlock :path />
    <BlockDivider />
    <p>You can change default timeline mode by adding mode prop to code block.</p>
    <DisplayCodeBlock name="calendar-timeline">mode: month</DisplayCodeBlock>
    <p>Suppoerted modes are:</p>
    <ul>
      <li v-for="mode in timelineModes" :key="mode">{{ mode }}</li>
    </ul>
    <BlockDivider />
    <DisplayCodeBlock name="journals-home" />
    <p>Home block displays links to current notes in journals.</p>
    <p>It looks like this by default:</p>
    <BlockDivider />
    <HomeCodeBlock :path :config="{ show: ['day'], separator: ' • ', scale: 1 }" />
    <BlockDivider />
    <p>Supported settings:</p>
    <ul>
      <li>
        <code>show</code> - controls what journals are displayed (by default only Today link is displayed). Supported
        values are - <code>day</code>, <code>week</code>, <code>month</code>, <code>quarter</code>, <code>year</code>,
        <code>custom</code>.
      </li>
      <li><code>separator</code> - used to separate multiple links. Default - <code> • </code>.</li>
      <li>
        <code>scale</code> - allows to increase size of links. Used as multiplier of text size - so to have links twice
        as large use <code>scale: 2</code>.
      </li>
      <li><code>shelf</code> - allows to limit journal displayed in block to some specific shelf.</li>
    </ul>
    <BlockDivider />
    <DisplayCodeBlock name="calendar-timeline"> {{ customHomeSettings }} </DisplayCodeBlock>
    <BlockDivider />
    <HomeCodeBlock :path :config="{ show: ['day', 'month'], separator: ' | ', scale: 2 }" />
  </div>
</template>

<style scoped>
.hint {
  color: var(--bold-color);
}
</style>
