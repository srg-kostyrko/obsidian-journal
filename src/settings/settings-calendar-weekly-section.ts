import { Setting } from "obsidian";
import { WeeklyCalendarSection } from "../contracts/config.types";
import { SettingsBaseCalendarSection } from "./settings-base-calendar-section";

export class SettingsCalendarWeeklySection extends SettingsBaseCalendarSection<WeeklyCalendarSection> {
  display(): void {
    super.display();
    const { containerEl } = this;
    if (this.config.enabled) {
      new Setting(containerEl).setName("First Day of Week").addDropdown((dropdown) => {
        dropdown
          .addOptions({
            monday: "Monday",
            sunday: "Sunday",
          })
          .setValue(this.config.firstDayOfWeek)
          .onChange((value) => {
            this.config.firstDayOfWeek = value as "monday" | "sunday";
            this.emit("save");
          });
      });
    }
  }
}
