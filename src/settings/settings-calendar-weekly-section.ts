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
            "-1": "From Locale",
            "0": "Sunday",
            "1": "Monday",
            "2": "Tuesday",
            "3": "Wednesday",
            "4": "Thursday",
            "5": "Friday",
            "6": "Saturday",
          })
          .setValue(String(this.config.firstDayOfWeek))
          .onChange((value) => {
            this.config.firstDayOfWeek = parseInt(value, 10);
            this.emit("save+redraw");
          });
      });
      if (this.config.firstDayOfWeek !== -1) {
        const s = new Setting(containerEl).setName("First Week of Year");
        s.setDesc(`First week of year must contain ${this.config.firstWeekOfYear ?? 1} January`);
        s.addText((text) => {
          text.setValue(String(this.config.firstWeekOfYear ?? 1)).onChange((value) => {
            if (value) {
              this.config.firstWeekOfYear = parseInt(value, 10);
              s.setDesc(`First week of year must contain ${this.config.firstWeekOfYear ?? 1} January`);
              this.emit("save");
            }
          });
        });
      }
    }
  }
}
