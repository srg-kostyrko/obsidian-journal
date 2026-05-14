import type { Module } from "@/infrastructure/di";

import { ModalService } from "./internal/modal-service";

export function createModalsModule(): Module {
  return {
    register(c) {
      c.register(ModalService).useClass(ModalService).eager();
    },
  };
}
