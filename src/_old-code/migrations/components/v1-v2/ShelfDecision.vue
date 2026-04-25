<script setup lang="ts">
import { ref } from "vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianToggle from "@/components/obsidian/ObsidianToggle.vue";
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";
import { usePlugin } from "@/composables/use-plugin";

const emit = defineEmits<{
  next: [];
}>();

const plugin = usePlugin();

const useShelves = ref(false);

function next() {
  if (useShelves.value) {
    plugin.usesShelves = true;
  }
  emit("next");
}
</script>

<template>
  <div>
    <ObsidianSetting heading name="Use shelves?" />
    <ObsidianSetting no-controls>
      <template #description>
        Shelves can be used to organize several journals into one logical group (like work or personal).<br />
        Enabling shelves before migration will convert all calendar journals that have more than one section enabled
        into a shelf.<br />
        You can always change this decision later.
      </template>
    </ObsidianSetting>
    <ObsidianSetting name="Enable shelves?">
      <ObsidianToggle v-model="useShelves" />
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="next">Next</ObsidianButton>
    </ObsidianSetting>
  </div>
</template>
