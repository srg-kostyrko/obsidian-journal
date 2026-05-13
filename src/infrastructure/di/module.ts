import type { Container } from "@/infrastructure/di/container";

export interface Module {
  register(c: Container): void;
}
