<script setup lang="ts">
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
</script>

<template>
  <UiButton flat class="ui-back-link">
    <UiIcon :name="icons.nav.back" />
    {{ m.common_label_back() }}
  </UiButton>
</template>

<style scoped>
.ui-back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--size-4-1);
  width: auto;
  margin-bottom: var(--size-4-2);
  color: var(--text-muted);
}
.ui-back-link:hover {
  color: var(--text-normal);
}
</style>
