import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DecorationBreakdownModal from "./DecorationBreakdownModal.vue";
import DecorationCellModal from "./DecorationCellModal.vue";

import type { BreakdownEntry } from "./breakdown-entry";

export const decorationBreakdownModal = defineModal()({
  component: DecorationBreakdownModal,
  title: (_: { shelf?: string | null }) => m.decoration_breakdown_title(),
  width: 700,
});

export const decorationCellModal = defineModal()({
  component: DecorationCellModal,
  title: (_: { entry: BreakdownEntry; shelf?: string | null }) => m.decoration_breakdown_title(),
  width: 700,
});
