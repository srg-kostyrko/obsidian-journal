import { HostError } from "../errors";

export class SuggestCancelled extends HostError {
  readonly kind = "suggest-cancelled" as const;

  constructor() {
    super("Suggest was cancelled.");
    this.name = "SuggestCancelled";
  }
}
