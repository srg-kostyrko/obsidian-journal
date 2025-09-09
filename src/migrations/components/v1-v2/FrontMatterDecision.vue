<script setup lang="ts">
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianToggle from "@/obsidian/components/ObsidianToggle.vue";

const keep = defineModel<boolean>();
defineEmits<{
  next: [];
}>();
</script>

<template>
  <div>
    <ObsidianSetting name="Frontmatter data" heading />
    <ObsidianSetting no-controls>
      <template #description>
        New plugin version by default reduces frontmatter data.<br />
        Instead of having start and end dates in frontmatter there is only 1 date (usually first day of month or year
        for example).<br />
        If you used start or end dates from frontmatter in some other plugins (like Dataview) you can configure plugin
        to keep start and end dates in frontmatter.<br />
        You can always change this decision later.
      </template>
    </ObsidianSetting>
    <ObsidianSetting name="Keep start and end dates in frontmatter?">
      <ObsidianToggle v-model="keep" />
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="$emit('next')">Next</ObsidianButton>
    </ObsidianSetting>
  </div>
</template>
