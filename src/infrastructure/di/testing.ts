import { vi } from "vitest";

import { Container } from "./container";
import { tokenName, type AnyTokenLike } from "./token";

import type { Module } from "./module";

export function createTestContainer(): Container {
  return new Container();
}

export function registrationOrder(module: Module): string[] {
  const c = new Container();
  const order: string[] = [];
  const register = c.register.bind(c);
  vi.spyOn(c, "register").mockImplementation((token: AnyTokenLike) => {
    order.push(tokenName(token));
    return register(token as never);
  });
  module.register(c);
  return order;
}

export function isOrderedSubsequence(inner: readonly string[], outer: readonly string[]): boolean {
  let index = 0;
  for (const name of outer) {
    if (index < inner.length && inner[index] === name) index += 1;
  }
  return index === inner.length;
}
