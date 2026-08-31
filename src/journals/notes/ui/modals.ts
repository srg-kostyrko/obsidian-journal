import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { defineModal } from "@/infrastructure/host/modals";

import ConfirmCreationModal from "./ConfirmCreationModal.vue";
import ConnectNoteModal from "./ConnectNoteModal.vue";

import type { TypeId } from "../../notelets/config";

export const confirmCreationModal = defineModal<boolean>()({
  component: ConfirmCreationModal,
  title: (_: { journalName: string; noteName: string }) => m.confirm_note_creation_title(),
});

export type ConnectNoteResult =
  | {
      action: "connect";
      journalName: string;
      anchor: AnchorString;
      override: boolean;
      rename: boolean;
      move: boolean;
      // Absent ⇒ the journal's period note. Present ⇒ a notelet of that type.
      typeId?: TypeId;
    }
  | { action: "disconnect"; journalName: string };

export const connectNoteModal = defineModal<ConnectNoteResult>()({
  component: ConnectNoteModal,
  title: (_: { path: VaultPath }) => m.command_connect_note(),
});
