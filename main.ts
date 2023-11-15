import { Notice, Plugin } from "obsidian";

export default class JournalPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon("dice", "Greet", () => {
      new Notice("Hello, world!");
    });
  }
}
