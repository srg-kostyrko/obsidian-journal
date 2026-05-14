import { HostError } from "../errors";

export class ModalCancelled extends HostError {
  readonly kind = "modal-cancelled" as const;

  constructor() {
    super("Modal was cancelled.");
    this.name = "ModalCancelled";
  }
}
