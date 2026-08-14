export interface ToolbarItemAppearance {
  readonly icon?: string;
  readonly label?: string;
  readonly tooltip?: string;
}

export type ToolbarAppearanceChange = (patch: ToolbarItemAppearance) => void;
