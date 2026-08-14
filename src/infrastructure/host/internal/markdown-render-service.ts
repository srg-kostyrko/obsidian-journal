import { Component, MarkdownRenderer } from "obsidian";

import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken } from "./tokens";

import type { Disposer } from "../input-suggests/types";

export class MarkdownRenderService {
  readonly #app = inject(InternalObsidianAppToken);

  render(element: HTMLElement, markdown: string, sourcePath: string): Disposer {
    const owner = new Component();
    owner.load();
    void MarkdownRenderer.render(this.#app, markdown, element, sourcePath, owner);
    return () => {
      owner.unload();
      element.replaceChildren();
    };
  }
}
