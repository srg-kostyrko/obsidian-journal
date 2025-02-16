import type { Plugin, TFile } from "obsidian";

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
