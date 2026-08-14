import { describe, expect, it } from "vitest";

import { Container } from "./container";
import { ContainerDisposedError, ScopedResolutionOutsideScopeError } from "./errors";
import { inject } from "./inject";
import { Lifetime } from "./lifetime";
import { createToken } from "./token";

describe("Container.createScope + Scope.resolve", () => {
  it("returns the same Container-lifetime instance as the parent container", () => {
    class Shared {
      readonly kind = "shared";
    }
    const c = new Container();
    c.register(Shared).useClass(Shared);
    const scope = c.createScope();
    expect(scope.resolve(Shared)).toBe(c.resolve(Shared));
  });

  it("returns a fresh Transient instance on every scope.resolve", () => {
    class Trans {
      readonly kind = "trans";
    }
    const c = new Container();
    c.register(Trans).useClass(Trans).lifetime(Lifetime.Transient);
    const scope = c.createScope();
    expect(scope.resolve(Trans)).not.toBe(scope.resolve(Trans));
  });

  it("returns one instance per scope for Scoped-lifetime bindings", () => {
    class Scoped {
      readonly kind = "scoped";
    }
    const c = new Container();
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    const s1 = c.createScope();
    const s2 = c.createScope();
    expect(s1.resolve(Scoped)).toBe(s1.resolve(Scoped));
    expect(s1.resolve(Scoped)).not.toBe(s2.resolve(Scoped));
  });

  it("throws ScopedResolutionOutsideScopeError when resolving a Scoped binding from the container", () => {
    class Scoped {
      readonly kind = "scoped";
    }
    const c = new Container();
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    expect(() => c.resolve(Scoped)).toThrow(ScopedResolutionOutsideScopeError);
  });

  it("lets Scoped factories inject Container-lifetime deps", () => {
    const dep = createToken<string>("Dep");
    class Scoped {
      readonly value = inject(dep);
    }
    const c = new Container();
    c.register(dep).useValue("v");
    c.register(Scoped).useClass(Scoped).lifetime(Lifetime.Scoped);
    const scope = c.createScope();
    expect(scope.resolve(Scoped).value).toBe("v");
  });
});

describe("Scope.dispose", () => {
  it("calls Symbol.dispose only on scope-resolved instances, not container-lifetime ones", async () => {
    const calls: string[] = [];
    class CScope {
      [Symbol.dispose]() {
        calls.push("c-scope");
      }
    }
    class Shared {
      [Symbol.dispose]() {
        calls.push("shared");
      }
    }
    const c = new Container();
    c.register(Shared).useClass(Shared);
    c.register(CScope).useClass(CScope).lifetime(Lifetime.Scoped);
    c.resolve(Shared);
    const scope = c.createScope();
    scope.resolve(CScope);
    scope.resolve(Shared);
    await scope.dispose();
    expect(calls).toEqual(["c-scope"]);
  });

  it("throws ContainerDisposedError after dispose", async () => {
    const c = new Container();
    const scope = c.createScope();
    await scope.dispose();
    expect(() => scope.resolve(createToken("X"))).toThrow(ContainerDisposedError);
  });

  it("disposes scoped instances in reverse insertion order", async () => {
    const order: string[] = [];
    class A {
      readonly kind = "a";
      [Symbol.dispose]() {
        order.push("A");
      }
    }
    class B {
      readonly kind = "b";
      [Symbol.dispose]() {
        order.push("B");
      }
    }
    const container = new Container();
    container.register(A).useClass(A).lifetime(Lifetime.Scoped);
    container.register(B).useClass(B).lifetime(Lifetime.Scoped);
    const scope = container.createScope();
    scope.resolve(A);
    scope.resolve(B);
    await scope.dispose();
    expect(order).toEqual(["B", "A"]);
  });
});
