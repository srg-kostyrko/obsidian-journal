import type { Token } from "@/infra/di/contracts/token.types";
import type { Modal } from "./modal.contract";
import type { Container } from "@/infra/di/container";
import { Scope } from "@/infra/di/contracts/scope.types";

export function registerModal<TIn, TOut>(
  container: Container,
  token: Token<Modal<TIn, TOut>>,
  factory: () => Modal<TIn, TOut>,
) {
  container.register(token).useFactory(factory).scoped(Scope.Transient);
}
