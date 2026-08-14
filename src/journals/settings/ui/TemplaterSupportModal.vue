<script setup lang="ts">
import { m } from "@/i18n";
</script>

<template>
  <div class="templater-support">
    <p>{{ m.templater_support_intro() }}</p>
    <p>{{ m.templater_support_setup_intro() }}</p>
    <ul>
      <li>{{ m.templater_support_option_settings() }}</li>
      <li>{{ m.templater_support_option_trigger_off() }}</li>
      <li>{{ m.templater_support_option_trigger_on() }}</li>
    </ul>
    <p>{{ m.templater_support_outro() }}</p>
  </div>
</template>
