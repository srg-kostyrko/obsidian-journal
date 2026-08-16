import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";
import type { NavBlockSegment } from "@/journals/config";

import EditNavBlockSegmentModal from "./EditNavBlockSegmentModal.vue";

export interface EditNavBlockSegmentModalProps {
  journalName: string;
  segment?: NavBlockSegment;
}

export const editNavBlockSegmentModal = defineModal<{ segment: NavBlockSegment }>()({
  component: EditNavBlockSegmentModal,
  title: ({ segment }: EditNavBlockSegmentModalProps) =>
    m.nav_block_segment_modal_title({ mode: segment ? "edit" : "add" }),
});
