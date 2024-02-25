import { ItemView, WorkspaceLeaf } from "obsidian";
import { CALENDAR_VIEW_TYPE } from "../constants";
import { JournalManager } from "../journal-manager";
import { CalendarViewMonth } from "./calendar-view-month";

export class CalendarView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private manager: JournalManager,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-days";
  }

  protected async onOpen(): Promise<void> {
    this.display();
  }

  protected display(): void {
    const container = this.containerEl.children[1];
    container.empty();
    const monthBlock = container.createDiv({
      cls: "journal-calendar-view",
    });

    new CalendarViewMonth(monthBlock, this.manager);
  }

  protected async onClose(): Promise<void> {
    // noop
  }
}
