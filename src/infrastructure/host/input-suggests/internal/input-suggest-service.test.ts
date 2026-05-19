import { __testing as obsidianTesting } from "obsidian";
import { afterEach, describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { defineInputSuggest } from "../define-input-suggest";

import { InputSuggestService } from "./input-suggest-service";

function build(): { service: InputSuggestService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(InputSuggestService).useClass(InputSuggestService);
  return { service: c.resolve(InputSuggestService), host };
}

const stringSuggest = defineInputSuggest<string>({
  fetch: (q) => ["alpha", "beta"].filter((s) => s.includes(q)),
  render: (item, element) => {
    element.setText(item);
  },
  toValue: (item) => item,
});

describe("InputSuggestService", () => {
  afterEach(() => obsidianTesting.reset());

  it("attaches an input suggest to the element", () => {
    const { service } = build();
    const input = document.createElement("input");
    service.attach(input, stringSuggest);
    expect(obsidianTesting.attachedInputSuggests.length).toBe(1);
  });

  it("dispose detaches the suggester", () => {
    const { service } = build();
    const input = document.createElement("input");
    const dispose = service.attach(input, stringSuggest);
    dispose();
    expect(obsidianTesting.attachedInputSuggests.length).toBe(0);
  });

  it("selection writes toValue into the element and dispatches an input event", () => {
    const { service } = build();
    const input = document.createElement("input");
    service.attach(input, stringSuggest);
    let dispatched = "";
    input.addEventListener("input", () => {
      dispatched = input.value;
    });
    const attached = obsidianTesting.lastAttachedInputSuggest() as unknown as {
      selectSuggestion: (item: string, event: MouseEvent) => void;
    };
    attached.selectSuggestion("alpha", new MouseEvent("click"));
    expect(input.value).toBe("alpha");
    expect(dispatched).toBe("alpha");
  });

  it("plugin unload disposes outstanding attachments", () => {
    const { service, host } = build();
    const input = document.createElement("input");
    service.attach(input, stringSuggest);
    host.triggerUnload();
    expect(obsidianTesting.attachedInputSuggests.length).toBe(0);
  });

  it("selection removes the suggester from the service's tracking", () => {
    const { service } = build();
    const input = document.createElement("input");
    const dispose = service.attach(input, stringSuggest);
    const attached = obsidianTesting.lastAttachedInputSuggest() as unknown as {
      selectSuggestion: (item: string, event: MouseEvent) => void;
    };
    attached.selectSuggestion("alpha", new MouseEvent("click"));
    // Calling dispose after selection should be idempotent and not attempt
    // to close an already-released suggester. Without selectSuggestion's
    // cleanup, dispose would still find the suggester in #attached and call
    // close() on a stale reference.
    expect(() => dispose()).not.toThrow();
    expect(obsidianTesting.attachedInputSuggests.length).toBe(0);
  });
});
