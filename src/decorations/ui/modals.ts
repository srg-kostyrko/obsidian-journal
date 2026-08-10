import type { Period } from "@/calendar";
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DecorationBreakdownModal from "./DecorationBreakdownModal.vue";

export const decorationBreakdownModal = defineModal()({
  component: DecorationBreakdownModal,
  title: (_: { period?: Period; shelf?: string | null }) => m.decoration_breakdown_title(),
  width: 700,
});
