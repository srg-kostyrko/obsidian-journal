import type { Container } from "./container";

export interface Module {
  register(c: Container): void;
}
