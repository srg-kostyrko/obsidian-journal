import { type MarkdownView, TFile, type App, type PaneType } from "obsidian";
import type { JournalPlugin, NotesManager } from "./types/plugin.types";
import { VueModal } from "./components/modals/vue-modal";
import ConfirmNoteCreationModal from "./components/modals/ConfirmNoteCreation.modal.vue";
import { tryApplyingTemplater } from "./utils/template";

// TODO getAbstractFileByPath replace with getFileByPath using wrapper
export class ObsidianNotesManager implements NotesManager {
  private app: App;
  constructor(private plugin: JournalPlugin) {
    this.app = plugin.app;
  }

  nodeExists(path: string): boolean {
    return Boolean(this.app.vault.getAbstractFileByPath(path));
  }

  async confirmNoteCreation(journalName: string, noteName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new VueModal(
        this.plugin,
        "About to create a new note",
        ConfirmNoteCreationModal,
        {
          journalName,
          noteName,
          onConfirm(confirm: boolean) {
            modal.close();
            resolve(confirm);
          },
          onClose() {
            modal.close();
            resolve(false);
          },
        },
        400,
      );
      modal.open();
    });
  }

  async createNote(path: string, content: string): Promise<void> {
    await this.#ensureFolderExists(path);
    await this.app.vault.create(path, content);
  }

  async updateNote(path: string, content: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.app.vault.modify(file, content);
  }

  async renameNote(path: string, newPath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.#ensureFolderExists(newPath);
    await this.app.vault.rename(file, newPath);
  }

  getMarkdownFiles() {
    return this.app.vault.getMarkdownFiles();
  }

  getNoteMetadata(path: string) {
    return this.app.metadataCache.getCache(path);
  }

  async openNote(path: string, mode?: PaneType) {
    const openedLeaf = this.findOpenedNote(path);
    if (openedLeaf) return this.app.workspace.setActiveLeaf(openedLeaf, { focus: true });
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  findOpenedNote(path: string) {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const { file } = leaf.view as MarkdownView;
      if (!file) continue;
      if (file.path === path) return leaf;
    }
    return null;
  }

  async getNoteContent(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return "";
    if (!(file instanceof TFile)) return "";
    return this.app.vault.read(file);
  }

  async updateNoteFrontmatter(path: string, action: (frontmatter: Record<string, unknown>) => void): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      action(frontmatter);
    });
  }

  async deleteNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.app.vault.delete(file);
  }

  async tryApplyingTemplater(templatePath: string, notePath: string, content: string): Promise<string> {
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!templateFile) return content;
    if (!(templateFile instanceof TFile)) return content;
    const note = this.app.vault.getAbstractFileByPath(notePath);
    if (!note) return content;
    if (!(note instanceof TFile)) return content;
    return tryApplyingTemplater(this.app, templateFile, note, content);
  }

  async #ensureFolderExists(path: string): Promise<void> {
    if (!path) return;
    const directories = path.split("/");
    if (path.endsWith(".md")) {
      directories.pop();
    }
    if (directories.length > 0) {
      const folderPath = directories.join("/");
      if (!this.app.vault.getAbstractFileByPath(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
    }
  }
}
