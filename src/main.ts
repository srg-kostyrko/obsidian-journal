import { Plugin } from "obsidian";
import { JournalSettingTab } from "./settings/journal-settings";
import { JournalManager } from "./journal-manager";
import { CodeBlockTimelineProcessor } from "./code-block-timeline/code-block-timeline-processor";
import { JournalConfigManager } from "./config/journal-config-manager";
import { CodeBlockHomeProcessor } from "./code-block-home/code-block-home-processor";
import { CodeBlockNavProcessor } from "./code-block-nav/code-block-nav-processor";
import { CodeBlockIntervalProcessor } from "./code-block-interval/code-block-interval-processor";
import { CALENDAR_VIEW_TYPE } from "./constants";
import { CalendarView } from "./calendar-view/calendar-view";

export default class JournalPlugin extends Plugin {
  private config: JournalConfigManager;
  private manager: JournalManager;
  async onload() {
    const appStartup = document.body.querySelector(".progress-bar") !== null;

    this.config = new JournalConfigManager(this);
    await this.config.load();

    this.manager = new JournalManager(this.app, this, this.config);
    this.addChild(this.manager);

    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this.manager));

    this.addSettingTab(new JournalSettingTab(this.app, this, this.manager, this.config));

    this.manager.configureRibbonIcons();

    this.registerMarkdownCodeBlockProcessor("calendar-timeline", (source, el, ctx) => {
      const processor = new CodeBlockTimelineProcessor(this.manager, source, el, ctx);
      ctx.addChild(processor);
    });

    this.registerMarkdownCodeBlockProcessor("calendar-nav", (source, el, ctx) => {
      const processor = new CodeBlockNavProcessor(this.manager, source, el, ctx);
      ctx.addChild(processor);
    });

    this.registerMarkdownCodeBlockProcessor("interval-nav", (source, el, ctx) => {
      const processor = new CodeBlockIntervalProcessor(this.manager, source, el, ctx);
      ctx.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("home", (source, el, ctx) => {
      const processor = new CodeBlockHomeProcessor(this.manager, source, el, ctx);
      ctx.addChild(processor);
    });
    this.app.workspace.onLayoutReady(async () => {
      await this.manager.reindex();
      this.manager.placeCalendarView();
      this.manager.configureCommands();
      if (appStartup) {
        await this.manager.autoCreateNotes();
        await this.manager.openStartupNote();
      }
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).forEach((leaf) => {
      leaf.detach();
    });
  }
}
