import * as v from "valibot";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Container } from "@/infrastructure/di";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { defineCodeBlock } from "../define-code-block";
import { CodeBlockDefinitionToken } from "../types";

import { CodeBlockService } from "./code-block-service";

const StubComponent = defineComponent({
  props: { config: { type: Object, required: true }, path: { type: String, required: true } },
  setup(props) {
    return () => h("span", { class: "stub" }, JSON.stringify(props.config));
  },
});

function build(): { container: Container; host: FakeHost } {
  const host = createFakeHost();
  const container = new Container();
  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(InternalObsidianAppToken).useValue(host.app);
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(CodeBlockService).useClass(CodeBlockService);
  return { container, host };
}

describe("CodeBlockService", () => {
  let context: ReturnType<typeof build>;
  beforeEach(() => {
    context = build();
  });

  describe("registration", () => {
    it("registers a processor for each key bound to the multi-token", () => {
      const definition = defineCodeBlock({
        keys: ["journals-home"],
        schema: v.object({}),
        component: StubComponent,
      });
      context.container.register(CodeBlockDefinitionToken).useValue(definition);

      context.container.resolve(CodeBlockService);

      expect(context.host.codeBlockProcessors.has("journals-home")).toBe(true);
    });

    it("registers every key when the definition lists multiple", () => {
      const definition = defineCodeBlock({
        keys: ["calendar-nav", "journal-nav", "interval-nav"],
        schema: v.object({}),
        component: StubComponent,
      });
      context.container.register(CodeBlockDefinitionToken).useValue(definition);

      context.container.resolve(CodeBlockService);

      expect([...context.host.codeBlockProcessors.keys()]).toEqual(
        expect.arrayContaining(["calendar-nav", "journal-nav", "interval-nav"]),
      );
    });

    it("registers nothing when no definitions are bound", () => {
      context.container.resolve(CodeBlockService);
      expect(context.host.codeBlockProcessors.size).toBe(0);
    });
  });

  describe("mounting", () => {
    const schema = v.object({
      show: v.optional(v.array(v.string()), () => ["day"] as const),
      separator: v.optional(v.string(), " • "),
    });

    function bind(): void {
      const definition = defineCodeBlock({ keys: ["journals-home"], schema, component: StubComponent });
      context.container.register(CodeBlockDefinitionToken).useValue(definition);
      context.container.resolve(CodeBlockService);
    }

    it("mounts the component with schema defaults when source is empty", () => {
      bind();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "");
      expect(el.querySelector(".stub")?.textContent).toContain('"separator":" • "');
      expect(el.querySelector(".stub")?.textContent).toContain('"show":["day"]');
    });

    it("passes parsed yaml fields through the schema to the component", () => {
      bind();
      const { el } = context.host.runCodeBlockProcessor(
        "journals-home",
        "separator: ' | '\nshow:\n  - week\n  - day\n",
      );
      const text = el.querySelector(".stub")?.textContent ?? "";
      expect(text).toContain('"separator":" | "');
      expect(text).toContain('"show":["week","day"]');
    });

    it("normalizes tabs to two spaces before parsing", () => {
      bind();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "show:\n\t- month\n");
      expect(el.querySelector(".stub")?.textContent).toContain('"show":["month"]');
    });

    it("passes the source path into the component props", () => {
      const PathStub = defineComponent({
        props: { config: { type: Object, required: true }, path: { type: String, required: true } },
        setup(props) {
          return () => h("span", { class: "stub-path" }, props.path);
        },
      });
      const definition = defineCodeBlock({ keys: ["journals-home"], schema, component: PathStub });
      context.container.register(CodeBlockDefinitionToken).useValue(definition);
      context.container.resolve(CodeBlockService);

      const { el } = context.host.runCodeBlockProcessor("journals-home", "", "Vault/Daily/2026-05-27.md");
      expect(el.querySelector(".stub-path")?.textContent).toBe("Vault/Daily/2026-05-27.md");
    });
  });

  describe("errors", () => {
    it("renders an error div and skips mounting when yaml is invalid", () => {
      const definition = defineCodeBlock({
        keys: ["journals-home"],
        schema: v.object({}),
        component: StubComponent,
      });
      context.container.register(CodeBlockDefinitionToken).useValue(definition);
      context.container.resolve(CodeBlockService);

      const { el } = context.host.runCodeBlockProcessor("journals-home", "key: [a, b, c");

      expect(el.querySelector(".stub")).toBeNull();
      expect(el.querySelector(".code-block-error")?.textContent).toContain("Failed to parse code block YAML");
    });
  });
});
