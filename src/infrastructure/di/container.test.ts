import { describe, expect, it } from "vitest";

import { Container } from "./container";
import {
  ContainerDisposedError,
  DuplicateRegistrationError,
  InvalidTokenError,
  TokenNotRegisteredError,
} from "./errors";
import { inject } from "./inject";
import { Lifetime } from "./lifetime";
import { createToken } from "./token";

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
