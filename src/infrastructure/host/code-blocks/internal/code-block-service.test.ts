import * as v from "valibot";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

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
  container.addModule(createLoggerTestingModule().module);
  container.register(CodeBlockService).useClass(CodeBlockService);
  return { container, host };
}

describe("CodeBlockService", () => {
  let context: ReturnType<typeof build>;
  beforeEach(() => {
    context = build();
  });

  function bindEmpty(): void {
    const definition = defineCodeBlock({ keys: ["journals-home"], schema: v.object({}), component: StubComponent });
    context.container.register(CodeBlockDefinitionToken).useValue(definition);
    context.container.resolve(CodeBlockService);
  }

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

    function bindWithKnownKeys(): void {
      const definition = defineCodeBlock({
        keys: ["journals-home"],
        schema,
        component: StubComponent,
        knownKeys: ["show", "separator"],
      });
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

    it("names an unrecognized key beside the rendered block", () => {
      bindWithKnownKeys();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "shows:\n  - week\n");
      expect(el.querySelector(".code-block-notice")?.textContent).toContain("shows");
    });

    it("still renders the block when a key is unrecognized", () => {
      bindWithKnownKeys();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "shows:\n  - week\n");
      expect(el.querySelector(".stub")).not.toBeNull();
    });

    it("says nothing when every key is recognized", () => {
      bindWithKnownKeys();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "separator: ' | '\n");
      expect(el.querySelector(".code-block-notice")).toBeNull();
    });

    it("says nothing about unknown keys for a block that declares none", () => {
      // The nav fence takes no options at all — v2 ignored its body — so every key would
      // otherwise be "unrecognized" and every nav block would carry a notice.
      bind();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "anything: 1\n");
      expect(el.querySelector(".code-block-notice")).toBeNull();
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
      expect(el.querySelector(".code-block-error")?.textContent).toContain(
        m.code_blocks_yaml_error({ key: "journals-home" }),
      );
    });

    it("names the fence the yaml error came from", () => {
      bindEmpty();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "key: [a, b, c");
      expect(el.querySelector(".code-block-error")?.textContent).toContain("journals-home");
    });

    it("shows the offending source so the user can see where the yaml broke", () => {
      // The parser's message carries the line, the column and an excerpt with a caret; all of
      // it went to the console, leaving the panel with nothing to act on.
      bindEmpty();
      const { el } = context.host.runCodeBlockProcessor("journals-home", "key: [a, b, c");
      expect(el.querySelector(".code-block-error__detail")?.textContent).toContain("key: [a, b, c");
    });

    it("renders an error div with issue paths when the schema rejects the parsed yaml", () => {
      const schema = v.object({ scale: v.number() });
      const definition = defineCodeBlock({ keys: ["journals-home"], schema, component: StubComponent });
      context.container.register(CodeBlockDefinitionToken).useValue(definition);
      context.container.resolve(CodeBlockService);

      const { el } = context.host.runCodeBlockProcessor("journals-home", "scale: notANumber");

      const errorElement = el.querySelector(".code-block-error");
      expect(errorElement).not.toBeNull();
      expect(errorElement?.textContent).toContain(m.code_blocks_schema_error({ key: "journals-home" }));
      expect(errorElement?.textContent).toContain("scale");
      expect(el.querySelector(".stub")).toBeNull();
    });
  });

  describe("lifecycle", () => {
    it("unmounts the Vue app and clears the container when the render child unloads", () => {
      const definition = defineCodeBlock({
        keys: ["journals-home"],
        schema: v.object({}),
        component: StubComponent,
      });
      context.container.register(CodeBlockDefinitionToken).useValue(definition);
      context.container.resolve(CodeBlockService);

      const { el, child } = context.host.runCodeBlockProcessor("journals-home", "");
      expect(el.querySelector(".stub")).not.toBeNull();

      child?.unload();

      expect(el.querySelector(".stub")).toBeNull();
      expect(el.children.length).toBe(0);
    });
  });
});
