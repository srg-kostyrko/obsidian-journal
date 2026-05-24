import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DeleteShelfModal from "./DeleteShelfModal.vue";

export interface DeleteShelfModalProps {
  shelfName: string;
  otherShelves: string[];
}

export const deleteShelfModal: ModalDefinition<DeleteShelfModalProps, string> = defineModal({
  component: DeleteShelfModal,
  title: ({ shelfName }: DeleteShelfModalProps) => m.shelf_delete_modal_title({ name: shelfName }),
});
