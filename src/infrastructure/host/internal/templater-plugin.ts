import type { Plugin, TFile } from "obsidian";

interface RunningConfig {
  template_file: TFile | undefined;
  target_file: TFile;
  run_mode: number;
  active_file?: TFile | null;
}

export type ParseCommands = (content: string, functionsObject: unknown) => Promise<string>;

/**
 * The one method every template body passes through — the template Templater was asked to run
 * and, on re-entry, each file `tp.file.include` pulls in. Optional because it is deeper into
 * Templater's internals than the rest of this surface.
 */
export interface TemplaterParser {
  parse_commands: ParseCommands;
}

export interface TemplaterPlugin extends Plugin {
  templater: {
    parser?: TemplaterParser;
    create_running_config(templateFile: TFile | undefined, targetFile: TFile, runMode: number): RunningConfig;
    parse_template(config: RunningConfig, content: string): Promise<string>;
  };
  editor_handler: {
    jump_to_next_cursor_location(file: TFile | null, autoJump: boolean): Promise<void>;
  };
}
