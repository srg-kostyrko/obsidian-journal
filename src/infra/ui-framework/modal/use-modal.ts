import type { Token } from "@/infra/di/contracts/token.types";
import type { Modal } from "./modal.contract";
import { useInjector } from "../use-injector";

export function useModal<TIn, TOut>(token: Token<Modal<TIn, TOut>>) {
  const injector = useInjector();
  const modal = injector.inject(token);
  return {
    open: (input: TIn) => modal.openModal(input),
    close: () => modal.close(),
  };
}
