import * as v from "valibot";

import { m } from "@/i18n";
import { DEFAULT_TASK_QUERY, taskQuerySchema } from "@/tasks/query";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";
import { windowKinds } from "../custom-intervals/window-resolution";

import TasksViewBlock from "./ui/TasksViewBlock.vue";
import TasksViewBlockConfig from "./ui/TasksViewBlockConfig.vue";

// Spread rather than nested under its own key: taskQuerySchema's own entries (scope/filter/sort)
// become this schema's own top-level fields, so the two schemas cannot drift apart. Unlike the
// journal-tasks fence, this config is JSON edited through a config UI, not hand-typed YAML — the
// fence had to flatten its own output because manual-fences.test.ts does a flat per-key lookup
// against documented fence examples, and that gate does not reach view blocks.
const schema = v.object({
  window: v.optional(v.picklist(windowKinds), "day"),
  journals: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
  ...taskQuerySchema.entries,
});

export type TasksViewBlockConfig = v.InferOutput<typeof schema>;
export type TasksViewBlockConfigChange = (config: TasksViewBlockConfig) => void;

export const tasksViewBlock = defineViewBlock<TasksViewBlockConfig>({
  key: "tasks",
  label: () => m.view_block_tasks_label(),
  description: () => m.view_block_tasks_description(),
  icon: icons.entity.task,
  schema,
  // Spreading DEFAULT_TASK_QUERY rather than re-listing scope/filter/sort by hand keeps this in
  // lockstep with taskQuerySchema's own default. Its nested objects are frozen and shared with
  // every other DEFAULT_TASK_QUERY consumer — safe here too, since a config is only ever read or
  // replaced wholesale, never mutated in place.
  defaultConfig: { window: "day", ...DEFAULT_TASK_QUERY },
  component: TasksViewBlock,
  configComponent: TasksViewBlockConfig,
  // No depth term here: scope.depth rides along in the stored query for parity with the fence,
  // but a window request always walks every journal already in scope (see TasksViewBlock.vue's
  // own comment), so a "Rolled up" summary would describe a rollup that never happens.
  summary: (config) => {
    const parts: string[] = [m.view_block_config_window_selected({ period: config.window })];
    if (config.journals !== undefined)
      parts.push(m.view_block_summary_journal_count({ count: config.journals.length }));
    return parts.join(" · ");
  },
});
