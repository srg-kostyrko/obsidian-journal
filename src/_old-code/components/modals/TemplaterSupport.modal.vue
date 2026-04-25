<script setup lang="ts">
defineEmits(["close"]);
</script>

<template>
  <div>
    <p>
      There can be cases when Templater is interfering with plugin actions resulting in partially broken note or journal
      related data removed from frontmatter.
    </p>
    <p>The best setup to avoid such problems would be:</p>
    <ul>
      <li>template configured in journal plugin settings</li>
      <li><code>Trigger Templater on new file creation</code> is disabled</li>
      <li>
        OR <code>Trigger Templater on new file creation</code> is enabled, <code>Enable Folder Templates</code> is
        enabled, <b>NO</b> Folder template is configured
      </li>
    </ul>
    <p>
      This ensures that only journal plugin is processing note template thus avoiding conflicts with templater plugin
      (journal plugin will use templater itself under the hood to process templater commands).
    </p>
  </div>
</template>

<style scoped></style>
