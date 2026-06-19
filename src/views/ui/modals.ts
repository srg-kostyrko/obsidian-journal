import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import AddBlockPickerModal from "./AddBlockPickerModal.vue";
import AddToolbarItemPickerModal from "./AddToolbarItemPickerModal.vue";
import DeleteViewModal from "./DeleteViewModal.vue";
import EditConfigModal from "./EditConfigModal.vue";
import ViewNameModal from "./ViewNameModal.vue";

import type { ToolbarItemDefinition } from "../define-toolbar-item";
import type { ViewBlockDefinition } from "../define-view-block";
import type { Component } from "vue";

export interface ViewNameModalProps {
  currentName?: string;
}

export const viewNameModal = defineModal<string>()({
  component: ViewNameModal,
  title: ({ currentName }: ViewNameModalProps) =>
    currentName === undefined ? m.view_add_modal_title() : m.view_rename(),
});

export interface DeleteViewModalProps {
  viewName: string;
}

export const deleteViewModal = defineModal()({
  component: DeleteViewModal,
  title: ({ viewName }: DeleteViewModalProps) => m.view_delete_modal_title({ name: viewName }),
});

export interface AddBlockPickerModalProps {
  definitions: readonly ViewBlockDefinition[];
}

export const addBlockPickerModal = defineModal<string>()({
  component: AddBlockPickerModal,
  title: (_: AddBlockPickerModalProps) => m.view_add_block(),
});

export interface AddToolbarItemPickerModalProps {
  definitions: readonly ToolbarItemDefinition[];
}

export const addToolbarItemPickerModal = defineModal<{ key: string; defaultConfig: unknown }>()({
  component: AddToolbarItemPickerModal,
  title: (_: AddToolbarItemPickerModalProps) => m.view_add_toolbar_item(),
});

export interface EditConfigModalProps {
  component: Component;
  config: Record<string, unknown>;
  typeLabel: string;
}

export const editToolbarItemModal = defineModal<Record<string, unknown>>()({
  component: EditConfigModal,
  title: ({ typeLabel }: EditConfigModalProps) => m.view_toolbar_item_edit_title({ type: typeLabel }),
});

export const editBlockModal = defineModal<Record<string, unknown>>()({
  component: EditConfigModal,
  title: ({ typeLabel }: EditConfigModalProps) => m.view_block_edit_title({ type: typeLabel }),
});
