import { __testing as obsidianTesting } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { defineSuggest } from "../define-suggest";
import { SuggestCancelled } from "../errors";

import { SuggestService } from "./suggest-service";

function build(): { service: SuggestService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(SuggestService).useClass(SuggestService);
  return { service: c.resolve(SuggestService), host };
}

const stringSuggest = defineSuggest<string[], string>({
  fetch: (q, items) => items.filter((s) => s.includes(q)),
  render: (item, element) => {
    element.setText(item);
  },
});

describe("SuggestService", () => {
  afterEach(() => obsidianTesting.reset());

  it("resolves with the chosen item", async () => {
    const { service } = build();
    const open = service.open(stringSuggest, ["alpha", "beta"]);
    const modal = obsidianTesting.lastOpenSuggestModal();
    (modal as unknown as { onChooseSuggestion: (item: string, event: MouseEvent) => void }).onChooseSuggestion(
      "alpha",
      {} as MouseEvent,
    );
    const result = await open;
    expectOk(result);
    expect(result.value).toBe("alpha");
  });

  it("resolves with the chosen item when the modal closes before the choose callback fires", async () => {
    const { service } = build();
    const open = service.open(stringSuggest, ["alpha", "beta"]);
    const modal = obsidianTesting.lastOpenSuggestModal() as unknown as {
      close: () => void;
      onChooseSuggestion: (item: string, event: MouseEvent) => void;
    };
    // Obsidian runs onClose before onChooseSuggestion when a suggestion is chosen by mouse;
    // a real choice must not be reported as a cancellation.
    modal.close();
    modal.onChooseSuggestion("beta", {} as MouseEvent);
    const result = await open;
    expectOk(result);
    expect(result.value).toBe("beta");
  });

  it("rejects with SuggestCancelled when closed without a choice", async () => {
    const { service } = build();
    const open = service.open(stringSuggest, ["alpha", "beta"]);
    const modal = obsidianTesting.lastOpenSuggestModal();
    (modal as unknown as { close: () => void }).close();
    const result = await open;
    expectErr(result);
    expect(result.error).toBeInstanceOf(SuggestCancelled);
  });

  it("invokes fetch with query and input", () => {
    const fetchSpy = vi.fn((q: string, items: string[]) => items.filter((s) => s.startsWith(q)));
    const definition = defineSuggest<string[], string>({ fetch: fetchSpy, render: () => undefined });
    const { service } = build();
    service.open(definition, ["foo", "bar"]);
    const modal = obsidianTesting.lastOpenSuggestModal() as unknown as { getSuggestions: (q: string) => unknown };
    modal.getSuggestions("f");
    expect(fetchSpy).toHaveBeenCalledWith("f", ["foo", "bar"]);
  });

  it("applies placeholder when supplied", () => {
    const definition = defineSuggest<string[], string>({
      placeholder: (items) => `pick from ${items.length}`,
      fetch: (_, items) => items,
      render: (item, element) => {
        element.setText(item);
      },
    });
    const { service } = build();
    service.open(definition, ["a", "b"]);
    const modal = obsidianTesting.lastOpenSuggestModal() as unknown as { placeholder: string };
    expect(modal.placeholder).toBe("pick from 2");
  });
});
