import { FlowError, type BenignFlowError } from "@/infrastructure/flows";

// Benign for the same reason as NothingToImport: the section disables its button and says why, so
// reaching this means the lock was taken between the render and the click.
export class SettingsLocked extends FlowError implements BenignFlowError {
  readonly kind = "settings-locked" as const;
  readonly benign = true as const;

  constructor() {
    super("Settings were saved by a newer version of the plugin and cannot be written until restart");
    this.name = "SettingsLocked";
  }
}

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
