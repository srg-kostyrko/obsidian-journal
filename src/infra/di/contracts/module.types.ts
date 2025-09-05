import type { Container } from "./container.types";
import type { Constructor } from "./token.types";

export interface Module {
  readonly provides?: Constructor<unknown>[];

  load?: (container: Container) => void;
}
