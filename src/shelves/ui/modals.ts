import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DeleteShelfModal from "./DeleteShelfModal.vue";
import PlaceJournalModal from "./PlaceJournalModal.vue";
import ShelfNameModal from "./ShelfNameModal.vue";

export interface DeleteShelfModalProps {
  shelfName: string;
  otherShelves: string[];
}

export const deleteShelfModal = defineModal<string>()({
  component: DeleteShelfModal,
  title: ({ shelfName }: DeleteShelfModalProps) => m.shelf_delete_modal_title({ name: shelfName }),
});

export interface PlaceJournalModalProps {
  currentShelf: string;
  shelfNames: string[];
}

export const placeJournalModal = defineModal<string>()({
  component: PlaceJournalModal,
  title: (_: PlaceJournalModalProps) => m.shelf_place_modal_title(),
});

export interface ShelfNameModalProps {
  currentName?: string;
  takenNames: string[];
}

export const shelfNameModal = defineModal<string>()({
  component: ShelfNameModal,
  title: ({ currentName }: ShelfNameModalProps) =>
    currentName === undefined ? m.shelf_add_modal_title() : m.shelf_rename_modal_title(),
});
