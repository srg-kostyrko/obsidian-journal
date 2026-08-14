import { useService } from "@/infrastructure/di";

import { ModalService } from "./internal/modal-service";

export function useModalService(): ModalService {
  return useService(ModalService);
}
