<script setup lang="ts">
import type { JournalSettings } from "@/types/settings.types";
import DisplayCodeBlock from "../DisplayCodeBlock.vue";
import NavigationCodeBlock from "@/code-blocks/navigation/NavigationCodeBlock.vue";
import TimelineCodeBlock from "@/code-blocks/timeline/TimelineCodeBlock.vue";
import BlockDivider from "../BlockDivider.vue";
import { useFakePathData } from "@/composables/use-fake-path-data";
import { timelineModes } from "@/code-blocks/timeline/timeline.types";

const { journalName } = defineProps<{
  type: JournalSettings["write"]["type"];
  journalName: string;
}>();

const path = useFakePathData(journalName);
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
  </div>
</template>

<style scoped>
.hint {
  color: var(--bold-color);
}
</style>
