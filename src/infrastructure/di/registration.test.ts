import { describe, expect, it } from "vitest";

import { Lifetime } from "./lifetime";
import { type RegistrationEntry, RegistrationBuilder } from "./registration";

function captureEntries<T>(): {
  entries: RegistrationEntry<T>[];
  onChange: (entry: RegistrationEntry<T>) => void;
} {
  const entries: RegistrationEntry<T>[] = [];
  return { entries, onChange: (entry) => entries.push(entry) };
}

describe("RegistrationBuilder", () => {
  describe("useClass", () => {
    it("emits an entry whose factory builds an instance of the given class", () => {
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
  });

  describe("useFactory", () => {
    it("emits an entry whose factory returns what useFactory provided", () => {
      const { entries, onChange } = captureEntries<number>();
      new RegistrationBuilder<number>(onChange).useFactory(() => 42);
      expect(entries[0].factory()).toBe(42);
    });
  });

  describe("useValue", () => {
    it("emits an entry whose factory returns the literal given to useValue", () => {
      const v = { id: 7 };
      const { entries, onChange } = captureEntries<typeof v>();
      new RegistrationBuilder<typeof v>(onChange).useValue(v);
      expect(entries[0].factory()).toBe(v);
    });
  });

  describe("defaults", () => {
    it("emits a Container-lifetime entry", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x");
      expect(entries.at(-1)?.lifetime).toBe(Lifetime.Container);
    });

    it("emits with eager=false", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x");
      expect(entries.at(-1)?.eager).toBe(false);
    });
  });
});

describe("RegistrationOptions", () => {
  describe("lifetime", () => {
    it("re-emits with the new lifetime", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x").lifetime(Lifetime.Transient);
      expect(entries).toHaveLength(2);
      expect(entries.at(-1)?.lifetime).toBe(Lifetime.Transient);
    });
  });

  describe("eager", () => {
    it("re-emits with eager=true", () => {
      const { entries, onChange } = captureEntries<string>();
      new RegistrationBuilder<string>(onChange).useValue("x").eager();
      expect(entries.at(-1)?.eager).toBe(true);
    });
  });
});
