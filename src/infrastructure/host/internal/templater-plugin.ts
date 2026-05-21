import type { Plugin, TFile } from "obsidian";

interface RunningConfig {
  template_file: TFile | undefined;
  target_file: TFile;
  run_mode: number;
  active_file?: TFile | null;
}

export interface TemplaterPlugin extends Plugin {
  templater: {
    create_running_config(templateFile: TFile | undefined, targetFile: TFile, runMode: number): RunningConfig;
    parse_template(config: RunningConfig, content: string): Promise<string>;
  };
  editor_handler: {
    jump_to_next_cursor_location(file: TFile | null, autoJump: boolean): Promise<void>;
  };
}
