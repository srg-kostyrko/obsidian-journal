import type { AsyncResult } from "@/infra/data-structures/result";
import type { FilePath } from "@/obsidian/contracts/vault.types";
import type { Plugin, TFile } from "obsidian";
import type { TemplaterError } from "./templater.error";

type RunMode = number;
interface RunningConfig {
  template_file: TFile | undefined;
  target_file: TFile;
  run_mode: RunMode;
  active_file?: TFile | null;
}

export interface TemplaterPlugin extends Plugin {
  templater: {
    create_running_config(template_file: TFile | undefined, target_file: TFile, run_mode: RunMode): RunningConfig;
    parse_template(config: RunningConfig, template_content: string): Promise<string>;
  };
  editor_handler: {
    jump_to_next_cursor_location(file: TFile | null, auto_jump: boolean): Promise<void>;
  };
}

export interface Templater {
  readonly isSupported: boolean;

  apply(templatePath: FilePath, notePath: FilePath, content: string): AsyncResult<string, TemplaterError>;
  jumpCursor(notePath: FilePath): AsyncResult<boolean, TemplaterError>;
}
