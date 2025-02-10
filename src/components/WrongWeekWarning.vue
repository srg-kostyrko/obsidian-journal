<script setup lang="ts"></script>

<template>
  <div class="warn">
    You use `W` to format weeks which does not respect custom week settings. This might show week number different from
    what is displayed in Calendar view.<br />
    It is recommended to use `w` instaed (and change start of week using plugin settings if needed).
  </div>
</template>

<style scoped>
.warn {
  color: rgb(var(--callout-warning));
}
</style>
