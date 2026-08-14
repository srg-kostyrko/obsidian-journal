<script setup lang="ts">
import { m } from "@/i18n";
import I18nWithSlot from "@/ui/I18nWithSlot.vue";

import VariableChip from "./VariableChip.vue";

const shiftUnits = [
  { key: "d", label: () => m.variable_modifications_unit_d() },
  { key: "w", label: () => m.variable_modifications_unit_w() },
  { key: "m", label: () => m.variable_modifications_unit_m() },
  { key: "q", label: () => m.variable_modifications_unit_q() },
  { key: "y", label: () => m.variable_modifications_unit_y() },
  { key: "h", label: () => m.variable_modifications_unit_h() },
];

const boundaryUnits = [
  { key: "day", label: () => m.variable_modifications_boundary_unit({ unit: "day" }) },
  { key: "week", label: () => m.variable_modifications_boundary_unit({ unit: "week" }) },
  { key: "month", label: () => m.variable_modifications_boundary_unit({ unit: "month" }) },
  { key: "quarter", label: () => m.variable_modifications_boundary_unit({ unit: "quarter" }) },
  { key: "year", label: () => m.variable_modifications_boundary_unit({ unit: "year" }) },
  { key: "decade", label: () => m.variable_modifications_boundary_unit({ unit: "decade" }) },
  { key: "hour", label: () => m.variable_modifications_boundary_unit({ unit: "hour" }) },
];
</script>

<template>
  <div class="date-modifications">
    <p>{{ m.variable_modifications_intro() }}</p>

    <h4>{{ m.variable_modifications_format_heading() }}</h4>
    <p>{{ m.variable_modifications_format_body() }}</p>
    <p>
      <I18nWithSlot :message="m.variable_modifications_format_example">
        <VariableChip name="date:YYYY" />
      </I18nWithSlot>
    </p>
    <p>
      <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
        {{ m.common_moment_format_reference() }}
      </a>
    </p>

    <h4>{{ m.variable_modifications_shift_heading() }}</h4>
    <p>{{ m.variable_modifications_shift_body() }}</p>
    <p>
      <I18nWithSlot :message="m.variable_modifications_shift_example">
        <VariableChip name="date+1w" />
      </I18nWithSlot>
    </p>
    <p>{{ m.common_supported_units() }}</p>
    <ul>
      <li v-for="unit in shiftUnits" :key="unit.key">{{ unit.label() }}</li>
    </ul>

    <h4>{{ m.variable_modifications_boundary_heading() }}</h4>
    <p>{{ m.variable_modifications_boundary_body() }}</p>
    <p>
      <I18nWithSlot :message="m.variable_modifications_boundary_example">
        <VariableChip name="date<startOf=year>" />
      </I18nWithSlot>
    </p>
    <p>{{ m.common_supported_units() }}</p>
    <ul>
      <li v-for="unit in boundaryUnits" :key="unit.key">{{ unit.label() }}</li>
    </ul>

    <h4>{{ m.variable_modifications_combined_heading() }}</h4>
    <p>{{ m.variable_modifications_combined_body() }}</p>
    <p>
      <I18nWithSlot :message="m.variable_modifications_combined_example">
        <VariableChip name="date+1w<startOf=week>:MMM DD, YYYY" />
      </I18nWithSlot>
    </p>

    <h4>{{ m.variable_modifications_number_heading() }}</h4>
    <p>{{ m.variable_modifications_number_body() }}</p>
    <p>
      <I18nWithSlot :message="m.variable_modifications_number_example">
        <VariableChip name="index+3:o" />
      </I18nWithSlot>
    </p>
  </div>
</template>
