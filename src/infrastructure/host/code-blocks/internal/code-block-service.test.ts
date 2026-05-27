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
});
