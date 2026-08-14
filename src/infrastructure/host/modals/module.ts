import type { Module } from "@/infrastructure/di";

import { ModalService } from "./internal/modal-service";

export const modalsModule: Module = {
  register(c) {
    c.register(ModalService).useClass(ModalService).eager();
  },
};
