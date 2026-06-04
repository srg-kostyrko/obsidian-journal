import { Notice } from "obsidian";

export class NoticeService {
  show(message: string): void {
    new Notice(message);
  }
}
