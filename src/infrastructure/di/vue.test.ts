import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import { Container } from "./container";
import { InjectorToken } from "./injector";
import { createMultiToken, createToken } from "./token";
import { provideInjector, useInjector, useService } from "./vue";

function makeContainer() {
  const c = new Container();
  return { c, injector: c.resolve(InjectorToken) };
}

describe("provideInjector + useService", () => {
  it("resolves a single-binding service inside a child component", () => {
    const { c, injector } = makeContainer();
    const t = createToken<string>("Greeting");
    c.register(t).useValue("hello");

    const Child = defineComponent({
      template: `<p>{{ greet }}</p>`,
      setup() {
        return { greet: useService(t) };
      },
    });

    const Root = defineComponent({
      components: { Child },
      template: `<Child />`,
      setup() {
        provideInjector(injector);
      },
    });

    render(Root);
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("resolves a multi-binding service to an array", () => {
    const { c, injector } = makeContainer();
    const t = createMultiToken<string>("Items");
    c.register(t).useValue("a");
    c.register(t).useValue("b");

    const Child = defineComponent({
      template: `<p>{{ items.join(",") }}</p>`,
      setup() {
        return { items: useService(t) };
      },
    });

    const Root = defineComponent({
      components: { Child },
      template: `<Child />`,
      setup() {
        provideInjector(injector);
      },
    });

    render(Root);
    expect(screen.getByText("a,b")).toBeTruthy();
  });

  it("throws when useService runs without a provided injector", () => {
    const t = createToken<string>("X");
    const Bad = defineComponent({
      template: `<div />`,
      setup() {
        useService(t);
      },
    });
    expect(() => render(Bad)).toThrow();
  });
});

describe("useInjector", () => {
  it("returns the provided injector", () => {
    const { injector } = makeContainer();
    let captured: unknown;
    const Child = defineComponent({
      template: `<div />`,
      setup() {
        captured = useInjector();
      },
    });
    const Root = defineComponent({
      components: { Child },
      template: `<Child />`,
      setup() {
        provideInjector(injector);
      },
    });
    render(Root);
    expect(captured).toBe(injector);
  });
});
