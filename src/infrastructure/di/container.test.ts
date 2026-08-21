import { describe, expect, it } from "vitest";

import { Container } from "./container";
import {
  CannotOverrideError,
  CircularDependencyError,
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  TokenNotRegisteredError,
} from "./errors";
import { inject } from "./inject";
import { Lifetime } from "./lifetime";
import { createMultiToken, createToken } from "./token";

import type { Module } from "./module";

describe("Container.register + resolve (Container lifetime, single)", () => {
  it("resolves a useValue binding back to the literal", () => {
    const c = new Container();
    const t = createToken<string>("Greeting");
    c.register(t).useValue("hi");
    expect(c.resolve(t)).toBe("hi");
  });

  it("resolves a useClass binding to an instance of the class", () => {
    class Service {
      readonly id = 1;
    }
    const c = new Container();
    const t = createToken<Service>("Service");
    c.register(t).useClass(Service);
    expect(c.resolve(t)).toBeInstanceOf(Service);
  });

  it("resolves a useFactory binding by calling the factory", () => {
    const c = new Container();
    const t = createToken<number>("N");
    c.register(t).useFactory(() => 7);
    expect(c.resolve(t)).toBe(7);
  });

  it("returns the same instance for a Container-lifetime binding on every resolve", () => {
    class Service {
      readonly id = Math.random();
    }
    const c = new Container();
    const t = createToken<Service>("S");
    c.register(t).useClass(Service);
    expect(c.resolve(t)).toBe(c.resolve(t));
  });

  it("wires dependencies via inject() inside a factory", () => {
    const c = new Container();
    const dep = createToken<string>("Dep");
    const top = createToken<string>("Top");
    c.register(dep).useValue("d-value");
    c.register(top).useFactory(() => inject(dep) + "-wrapped");
    expect(c.resolve(top)).toBe("d-value-wrapped");
  });

  it("supports a class as its own token", () => {
    class Service {
      readonly id = 9;
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    expect(c.resolve(Service)).toBeInstanceOf(Service);
  });

  it("throws TokenNotRegisteredError when resolving an unbound token", () => {
    const c = new Container();
    expect(() => c.resolve(createToken("Missing"))).toThrow(TokenNotRegisteredError);
  });

  it("throws DuplicateRegistrationError on a second register for a single-binding token", () => {
    const c = new Container();
    const t = createToken<string>("X");
    c.register(t).useValue("a");
    expect(() => c.register(t).useValue("b")).toThrow(DuplicateRegistrationError);
  });

  it("throws InvalidTokenError when register is given a non-token", () => {
    const c = new Container();
    expect(() => c.register({ name: "fake" } as never)).toThrow(InvalidTokenError);
  });

  it("throws ContainerDisposedError after dispose()", async () => {
    const c = new Container();
    await c.dispose();
    expect(() => c.resolve(createToken("X"))).toThrow(ContainerDisposedError);
    expect(() => c.register(createToken("Y"))).toThrow(ContainerDisposedError);
  });
});

describe("Container.resolve (Transient lifetime)", () => {
  it("returns a fresh instance on every resolve when lifetime is Transient", () => {
    class Service {
      readonly id = Math.random();
    }
    const c = new Container();
    const t = createToken<Service>("S");
    c.register(t).useClass(Service).lifetime(Lifetime.Transient);
    expect(c.resolve(t)).not.toBe(c.resolve(t));
  });

  it("still injects deps for Transient bindings", () => {
    const c = new Container();
    const dep = createToken<number>("Dep");
    const top = createToken<number>("Top");
    c.register(dep).useValue(3);
    c.register(top)
      .useFactory(() => inject(dep) * 2)
      .lifetime(Lifetime.Transient);
    expect(c.resolve(top)).toBe(6);
    expect(c.resolve(top)).toBe(6);
  });
});

describe("Container.resolve (multi tokens)", () => {
  it("collects multiple registrations into an array in registration order", () => {
    const c = new Container();
    const t = createMultiToken<string>("Plugins");
    c.register(t).useValue("a");
    c.register(t).useValue("b");
    c.register(t).useValue("c");
    expect(c.resolve(t)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when a multi-token has no bindings", () => {
    const c = new Container();
    const t = createMultiToken<string>("Plugins");
    expect(c.resolve(t)).toEqual([]);
  });

  it("resolves a multi-token to an array via inject() inside a factory", () => {
    const c = new Container();
    const items = createMultiToken<string>("Items");
    const list = createToken<string[]>("List");
    c.register(items).useValue("x");
    c.register(items).useValue("y");
    c.register(list).useFactory(() => inject(items));
    expect(c.resolve(list)).toEqual(["x", "y"]);
  });

  it("does not throw DuplicateRegistrationError when registering the same multi-token twice", () => {
    const c = new Container();
    const t = createMultiToken<string>("Plugins");
    c.register(t).useValue("a");
    expect(() => c.register(t).useValue("b")).not.toThrow();
  });
});

describe("Container.resolve (cycle detection)", () => {
  it("throws CircularDependencyError when A depends on B and B depends on A", () => {
    const c = new Container();
    const a = createToken<unknown>("A");
    const b = createToken<unknown>("B");
    c.register(a).useFactory(() => ({ b: inject(b) }));
    c.register(b).useFactory(() => ({ a: inject(a) }));
    expect(() => c.resolve(a)).toThrow(CircularDependencyError);
  });

  it("reports the offending chain in the CircularDependencyError", () => {
    const c = new Container();
    const a = createToken<unknown>("A");
    const b = createToken<unknown>("B");
    c.register(a).useFactory(() => ({ b: inject(b) }));
    c.register(b).useFactory(() => ({ a: inject(a) }));
    let captured: unknown;
    try {
      c.resolve(a);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(CircularDependencyError);
    expect((captured as CircularDependencyError).chain).toEqual(["A", "B", "A"]);
  });
});

describe("Container.autoLoad", () => {
  it("resolves eager bindings without an explicit resolve()", async () => {
    const c = new Container();
    const events: string[] = [];
    const EagerToken = createToken<unknown>("Eager");
    c.register(EagerToken)
      .useFactory(() => {
        events.push("constructed");
        return {};
      })
      .eager();
    expect(events).toEqual([]);
    await c.autoLoad();
    expect(events).toEqual(["constructed"]);
  });

  it("does not resolve non-eager bindings", async () => {
    const c = new Container();
    let constructed = false;
    const LazyToken = createToken<unknown>("Lazy");
    c.register(LazyToken).useFactory(() => {
      constructed = true;
      return {};
    });
    await c.autoLoad();
    expect(constructed).toBe(false);
  });

  it("resolves eager bindings in registration order", async () => {
    const c = new Container();
    const order: string[] = [];
    const A = createToken<unknown>("A");
    const B = createToken<unknown>("B");
    c.register(A)
      .useFactory(() => {
        order.push("A");
        return {};
      })
      .eager();
    c.register(B)
      .useFactory(() => {
        order.push("B");
        return {};
      })
      .eager();
    await c.autoLoad();
    expect(order).toEqual(["A", "B"]);
  });

  it("shares Container-lifetime instances between eager autoLoad and later resolve", async () => {
    const c = new Container();
    const ServiceToken = createToken<object>("Service");
    c.register(ServiceToken)
      .useFactory(() => ({}))
      .eager();
    await c.autoLoad();
    const first = c.resolve(ServiceToken);
    expect(c.resolve(ServiceToken)).toBe(first);
  });

  it("lets a later eager binding inject() an earlier eager sibling", async () => {
    const c = new Container();
    const counter = createToken<{ n: number }>("Counter");
    const adder = createToken<{ go: () => void }>("Adder");
    c.register(counter)
      .useFactory(() => ({ n: 0 }))
      .eager();
    c.register(adder)
      .useFactory(() => {
        const ctr = inject(counter);
        ctr.n += 1;
        return {
          go: () => {
            ctr.n += 1;
          },
        };
      })
      .eager();
    await c.autoLoad();
    expect(c.resolve(counter).n).toBe(1);
  });
});

describe("Container.dispose", () => {
  it("calls Symbol.dispose on resolved instances that implement it", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    expect(calls).toEqual(["disposed"]);
  });

  it("awaits Symbol.asyncDispose when present", async () => {
    const calls: string[] = [];
    class Service {
      async [Symbol.asyncDispose]() {
        await Promise.resolve();
        calls.push("async-disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    expect(calls).toEqual(["async-disposed"]);
  });

  it("prefers Symbol.asyncDispose over Symbol.dispose when both are defined", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("sync");
      }
      async [Symbol.asyncDispose]() {
        calls.push("async");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    expect(calls).toEqual(["async"]);
  });

  it("disposes in reverse registration order", async () => {
    const order: string[] = [];
    class A {
      [Symbol.dispose]() {
        order.push("A");
      }
    }
    class B {
      [Symbol.dispose]() {
        order.push("B");
      }
    }
    class C {
      [Symbol.dispose]() {
        order.push("C");
      }
    }
    const c = new Container();
    c.register(A).useClass(A);
    c.resolve(A);
    c.register(B).useClass(B);
    c.resolve(B);
    c.register(C).useClass(C);
    c.resolve(C);
    await c.dispose();
    expect(order).toEqual(["C", "B", "A"]);
  });

  it("skips instances that have neither Symbol.dispose nor Symbol.asyncDispose", async () => {
    class Plain {
      readonly id = 1;
    }
    const c = new Container();
    c.register(Plain).useClass(Plain);
    c.resolve(Plain);
    await expect(c.dispose()).resolves.toBeUndefined();
  });

  it("skips bindings that were registered but never resolved", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    await c.dispose();
    expect(calls).toEqual([]);
  });

  it("runs every dispose even when an earlier one throws, then rejects with AggregateError", async () => {
    const order: string[] = [];
    class A {
      [Symbol.dispose]() {
        order.push("A");
        throw new Error("A-boom");
      }
    }
    class B {
      [Symbol.dispose]() {
        order.push("B");
      }
    }
    const c = new Container();
    c.register(A).useClass(A);
    c.resolve(A);
    c.register(B).useClass(B);
    c.resolve(B);
    await expect(c.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(order).toEqual(["B", "A"]);
  });

  it("is idempotent — second dispose() resolves without re-running cleanup", async () => {
    const calls: string[] = [];
    class Service {
      [Symbol.dispose]() {
        calls.push("disposed");
      }
    }
    const c = new Container();
    c.register(Service).useClass(Service);
    c.resolve(Service);
    await c.dispose();
    await c.dispose();
    expect(calls).toEqual(["disposed"]);
  });
});

describe("Container.addModule", () => {
  it("invokes the module's register hook with the container", () => {
    const c = new Container();
    const t = createToken<string>("X");
    const M: Module = {
      register(container) {
        container.register(t).useValue("from-module");
      },
    };
    c.addModule(M);
    expect(c.resolve(t)).toBe("from-module");
  });

  it("invokes each module in order via addModules", () => {
    const c = new Container();
    const order: string[] = [];
    const A: Module = { register: () => order.push("A") };
    const B: Module = { register: () => order.push("B") };
    c.addModules([A, B]);
    expect(order).toEqual(["A", "B"]);
  });

  it("returns the container for chaining", () => {
    const c = new Container();
    const M: Module = { register: () => undefined };
    expect(c.addModule(M)).toBe(c);
  });
});

describe("override", () => {
  it("replaces the factory of an existing single binding", () => {
    const c = new Container();
    const token = createToken<string>("greeting");
    c.register(token).useValue("original");

    c.override(token).useValue("replaced");

    expect(c.resolve(token)).toBe("replaced");
  });

  it("keeps the replacement for every later resolve", () => {
    const c = new Container();
    const token = createToken<string>("greeting");
    c.register(token).useValue("original");
    c.override(token).useValue("replaced");

    c.resolve(token);

    expect(c.resolve(token)).toBe("replaced");
  });

  it("lets a class binding be replaced by a value", () => {
    class Real {
      readonly kind = "real";
    }
    const c = new Container();
    c.register(Real).useClass(Real);

    c.override(Real).useValue({ kind: "fake" } as unknown as Real);

    expect(c.resolve(Real).kind).toBe("fake");
  });

  it("refuses an unregistered token", () => {
    const c = new Container();
    const token = createToken<string>("absent");

    expect(() => c.override(token)).toThrow(CannotOverrideError);
    expect(() => c.override(token)).toThrow(expect.objectContaining({ reason: "unregistered" }));
  });

  it("refuses a multi-token", () => {
    const c = new Container();
    const token = createMultiToken<string>("plugins");
    c.register(token).useValue("one");

    expect(() => c.override(token)).toThrow(CannotOverrideError);
    expect(() => c.override(token)).toThrow(expect.objectContaining({ reason: "multi" }));
  });

  it("refuses an already-resolved token", () => {
    const c = new Container();
    const token = createToken<string>("greeting");
    c.register(token).useValue("original");
    c.resolve(token);

    expect(() => c.override(token)).toThrow(CannotOverrideError);
    expect(() => c.override(token)).toThrow(expect.objectContaining({ reason: "resolved" }));
  });

  it("throws InvalidTokenError when given a non-token", () => {
    const c = new Container();

    expect(() => c.override({} as never)).toThrow(InvalidTokenError);
  });

  it("throws ContainerDisposedError after dispose", async () => {
    const c = new Container();
    const token = createToken<string>("greeting");
    c.register(token).useValue("original");
    await c.dispose();

    expect(() => c.override(token)).toThrow(ContainerDisposedError);
  });

  it("refuses a Scoped binding", () => {
    const c = new Container();
    const token = createToken<string>("scoped");
    c.register(token).useValue("original").lifetime(Lifetime.Scoped);

    expect(() => c.override(token)).toThrow(CannotOverrideError);
    expect(() => c.override(token)).toThrow(expect.objectContaining({ reason: "scoped" }));
  });

  it("keeps the overridden binding eager", async () => {
    const c = new Container();
    const token = createToken<string>("greeting");
    c.register(token).useValue("original").eager();

    const built: string[] = [];
    c.override(token).useFactory(() => {
      built.push("replacement");
      return "replaced";
    });
    await c.autoLoad();

    expect(built).toEqual(["replacement"]);
  });

  it("keeps the overridden binding's lifetime", () => {
    const c = new Container();
    const token = createToken<object>("transient");
    c.register(token)
      .useFactory(() => ({}))
      .lifetime(Lifetime.Transient);

    c.override(token).useFactory(() => ({}));

    expect(c.resolve(token)).not.toBe(c.resolve(token));
  });

  it("lets the override widen a lazy binding to eager", async () => {
    const c = new Container();
    const token = createToken<string>("greeting");
    c.register(token).useValue("original");

    const built: string[] = [];
    c.override(token)
      .useFactory(() => {
        built.push("replacement");
        return "replaced";
      })
      .eager();
    await c.autoLoad();

    expect(built).toEqual(["replacement"]);
  });
});
