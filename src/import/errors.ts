import { FlowError, type BenignFlowError } from "@/infrastructure/flows";

// The Maintenance button disables itself using the same hasAnythingToImport() predicate, so this
// is reached only if the plugins' settings change between rendering the page and clicking.
export class NothingToImport extends FlowError implements BenignFlowError {
  readonly kind = "nothing-to-import" as const;
  readonly benign = true as const;

  constructor() {
    super("No supported plugin has settings to import");
    this.name = "NothingToImport";
  }
}
