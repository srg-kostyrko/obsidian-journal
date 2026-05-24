import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import PlaceJournalModal from "./PlaceJournalModal.vue";

export interface PlaceJournalModalProps {
  currentShelf: string;
  shelfNames: string[];
}

export const placeJournalModal: ModalDefinition<PlaceJournalModalProps, string> = defineModal({
  component: PlaceJournalModal,
  title: () => m.shelf_place_modal_title(),
});
