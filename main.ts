import { Plugin } from "obsidian";
import { JournalSettingTab } from "./src/settings/journal-settings";
import { JournalManager } from "./src/journal-manager";
import { CodeBlockTimelineProcessor } from "./src/code-block/code-block-timeline-processor";
import { JournalConfigManager } from "./src/config/journal-config-manager";

export default class JournalPlugin extends Plugin {
  private config: JournalConfigManager;
  private manager: JournalManager;
  async onload() {
    const appStartup = document.body.querySelector(".progress-bar") !== null;

    this.config = new JournalConfigManager(this);
    await this.config.load();
    this.manager = new JournalManager(this.app, this, this.config);
    this.addChild(this.manager);

    this.addSettingTab(new JournalSettingTab(this.app, this, this.manager, this.config));

    this.manager.configureRibbonIcons();

    this.registerMarkdownCodeBlockProcessor("journal-timeline", (source, el, ctx) => {
      const processor = new CodeBlockTimelineProcessor(this.manager, source, el, ctx);
      ctx.addChild(processor);
      processor.display();
    });

    this.app.workspace.onLayoutReady(async () => {
      await this.manager.reindex();
      this.manager.configureCommands();
      if (appStartup) {
        await this.manager.autoCreateNotes();
        await this.manager.openStartupNote();
      }
    });
  }
}
