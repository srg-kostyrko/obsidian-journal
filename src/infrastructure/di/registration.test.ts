import { describe, expect, it } from "vitest";

import { Lifetime } from "./lifetime";
import { type RegistrationEntry, RegistrationBuilder } from "./registration";

function captureEntries<T>(): { entries: RegistrationEntry<T>[]; onChange: (entry: RegistrationEntry<T>) => void } {
  const entries: RegistrationEntry<T>[] = [];
  return { entries, onChange: (entry) => entries.push(entry) };
}

describe("RegistrationBuilder", () => {
  it("emits no entry until a terminal method is called", () => {
    const { entries, onChange } = captureEntries<string>();
    const b = new RegistrationBuilder<string>(onChange);
    b.lifetime(Lifetime.Transient).eager();
    expect(entries).toEqual([]);
  });

  it("emits an entry whose factory builds an instance of the class given to useClass", () => {
    class Foo {
      hello = "hi";
    }
    const { entries, onChange } = captureEntries<Foo>();
    new RegistrationBuilder<Foo>(onChange).useClass(Foo);
    expect(entries).toHaveLength(1);
    const instance = entries[0].factory();
    expect(instance).toBeInstanceOf(Foo);
    expect(instance.hello).toBe("hi");
  });

  it("emits an entry whose factory returns what useFactory provided", () => {
    const { entries, onChange } = captureEntries<number>();
    new RegistrationBuilder<number>(onChange).useFactory(() => 42);
    expect(entries[0].factory()).toBe(42);
  });

  it("emits an entry whose factory returns the literal given to useValue", () => {
    const v = { id: 7 };
    const { entries, onChange } = captureEntries<typeof v>();
    new RegistrationBuilder<typeof v>(onChange).useValue(v);
    expect(entries[0].factory()).toBe(v);
  });

  it("defaults the emitted lifetime to Container", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x");
    expect(entries.at(-1)?.lifetime).toBe(Lifetime.Container);
  });

  it("re-emits with the new lifetime when .lifetime() is called after a terminal", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x").lifetime(Lifetime.Transient);
    expect(entries).toHaveLength(2);
    expect(entries.at(-1)?.lifetime).toBe(Lifetime.Transient);
  });

  it("re-emits with eager=true when .eager() is called after a terminal", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x").eager();
    expect(entries.at(-1)?.eager).toBe(true);
  });

  it("defaults eager to false", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("x");
    expect(entries.at(-1)?.eager).toBe(false);
  });

  it("uses the latest terminal-method factory when more than one is called", () => {
    const { entries, onChange } = captureEntries<string>();
    new RegistrationBuilder<string>(onChange).useValue("first").useFactory(() => "second");
    expect(entries.at(-1)?.factory()).toBe("second");
  });
});
