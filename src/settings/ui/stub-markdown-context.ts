import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownSectionInformation } from "obsidian";

export const stubMarkdownContext: MarkdownPostProcessorContext = {
  docId: "",
  sourcePath: "",
  frontmatter: undefined,
  addChild: function (_child: MarkdownRenderChild): void {
    // no-op
  },
  getSectionInfo: function (_el: HTMLElement): MarkdownSectionInformation | null {
    // no-op
    return null;
  },
};
