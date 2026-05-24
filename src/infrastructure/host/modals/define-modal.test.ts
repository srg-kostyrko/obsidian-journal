import { describe, expectTypeOf, it } from "vitest";
import { defineComponent } from "vue";

import { defineModal } from "./define-modal";

import type { ModalDefinition } from "./types";

const Stub = defineComponent({ template: "<div />" });

describe("defineModal", () => {
  it("infers TProps from title and takes TResult from the call generic", () => {
    const definition = defineModal<number>()({
      component: Stub,
      title: ({ name }: { name: string }) => name,
    });
    expectTypeOf(definition).toEqualTypeOf<ModalDefinition<{ name: string }, number>>();
  });

  it("defaults TResult to void when omitted", () => {
    const definition = defineModal()({
      component: Stub,
      title: ({ name }: { name: string }) => name,
    });
    expectTypeOf(definition).toEqualTypeOf<ModalDefinition<{ name: string }, void>>();
  });

  it("normalizes a numeric width into a (props) => number function", () => {
    const definition = defineModal()({
      component: Stub,
      title: ({ name }: { name: string }) => name,
      width: 520,
    });
    expectTypeOf(definition.width).toEqualTypeOf<((props: { name: string }) => number) | undefined>();
  });

  it("normalizes a string cssClass into a readonly string[]", () => {
    const definition = defineModal()({ component: Stub, title: () => "x", cssClass: "foo" });
    expectTypeOf(definition.cssClass).toEqualTypeOf<readonly string[]>();
  });
});
