import type { Container } from "./container.types";
import type { Constructor } from "./token.types";

export interface Module {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly provides?: Constructor<unknown, any[]>[];

  load?: (container: Container) => void;
}
