import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import ShelfNameModal from "./ShelfNameModal.vue";

export interface ShelfNameModalProps {
  currentName?: string;
  takenNames: string[];
}

export const shelfNameModal: ModalDefinition<ShelfNameModalProps, string> = defineModal({
  component: ShelfNameModal,
  title: ({ currentName }: ShelfNameModalProps) =>
    currentName === undefined ? m.shelf_add_modal_title() : m.shelf_rename_modal_title(),
});
