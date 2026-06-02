import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import type { AnchorString } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex } from "@/journals";

import { useCodeBlockPreviewPath } from "./use-code-block-preview-path";

class FakeCycleService {
  anchorOf(): Option<AnchorString> {
    return Option.some("2026-05-27" as AnchorString);
  }
}

function renderDiv() {
  return h("div");
}

function setup() {
  const index = new JournalsIndex();
  const container = new Container();
  container.register(JournalsIndex).useValue(index);
  container.register(CycleService).useValue(new FakeCycleService() as unknown as CycleService);

  let captured: VaultPath | null = null;
  const Host = defineComponent({
    setup() {
      captured = useCodeBlockPreviewPath("Daily");
      return renderDiv;
    },
  });

  const utilities = render(Host, {
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

  if (captured === null) throw new Error("path not captured");
  return { index, path: captured, unmount: () => utilities.unmount() };
}

afterEach(() => cleanup());

describe("useCodeBlockPreviewPath", () => {
  it("registers a synthetic entry resolvable by the returned path", () => {
    const { index, path } = setup();
    const entry = index.entryByPath(path);
    expect(entry.isSome() && entry.value).toMatchObject({ journalName: "Daily", anchor: "2026-05-27", path });
  });

  it("unregisters the synthetic entry on unmount", () => {
    const { index, path, unmount } = setup();
    unmount();
    expect(index.entryByPath(path).isSome()).toBe(false);
  });
});
