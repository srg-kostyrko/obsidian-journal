import { HostError } from "../errors";

export class ModalCancelled extends HostError {
  readonly kind = "modal-cancelled" as const;

  constructor() {
    super("Modal was cancelled.");
    this.name = "ModalCancelled";
  }
}

export class ModalContextError extends HostError {
  readonly kind = "modal-context-missing" as const;

  constructor() {
    super("useModal() must be called inside a modal opened via ModalService.");
    this.name = "ModalContextError";
  }
}
