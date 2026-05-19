import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, ref, type Ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import { useInvertibilityCheck } from "./use-invertibility-check";

afterEach(() => cleanup());

function buildContainer(): Container {
  const engine = installTestEngine();
  const container = new Container();
  container.register(TemplateEngine).useValue(engine);
  return container;
}

function probe(template: Ref<string>): { warning: Ref<unknown> } {
  const container = buildContainer();
  let captured: Ref<unknown> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useInvertibilityCheck(template);
      return undefined;
    },
    template: "<div />",
  });
  render(Probe, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return { warning: captured! };
}

describe("useInvertibilityCheck", () => {
  it("returns null for an invertible template with only known variables", () => {
    const { warning } = probe(ref("{{date}}-{{journal_name}}"));
    expect(warning.value).toBeNull();
  });

  it("returns null for a static template", () => {
    const { warning } = probe(ref("static-note"));
    expect(warning.value).toBeNull();
  });

  it("flags a template containing a function token", () => {
    const { warning } = probe(ref("{{date}}-{{format(YYYY)}}"));
    expect(warning.value).toMatchObject({ reason: "function-token" });
  });

  it("flags a template containing an unknown variable", () => {
    const { warning } = probe(ref("{{date}}-{{mystery}}"));
    expect(warning.value).toMatchObject({ reason: "unknown-variable", offending: "mystery" });
  });
});
