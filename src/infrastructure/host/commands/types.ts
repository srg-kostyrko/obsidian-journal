export interface CommandRegistration {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly ribbon?: boolean;
  readonly check?: () => boolean;
  readonly execute: () => void | Promise<void>;
}
