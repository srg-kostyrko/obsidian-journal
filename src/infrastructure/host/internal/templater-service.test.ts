import { TFile } from "obsidian";
import { describe, it, expect } from "vitest";

import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { expectOk } from "@/infrastructure/result/testing";

import { TemplaterService } from "./templater-service";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";
import type { App } from "obsidian";

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

interface FakeAppOptions {
  plugin?: unknown;
  files?: Record<string, TFile>;
}

function fakeApp(options: FakeAppOptions = {}): App {
  const files = options.files ?? {};
  return {
    plugins: {
      getPlugin: (id: string): unknown => (id === "templater-obsidian" ? (options.plugin ?? null) : null),
    },
    vault: {
      getAbstractFileByPath: (path: string): TFile | null => files[path] ?? null,
    },
  } as unknown as App;
}

function build(app: App): TemplaterService {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(InternalObsidianAppToken).useValue(app);
  c.register(TemplaterService).useClass(TemplaterService);
  return c.resolve(TemplaterService);
}

describe("TemplaterService.apply", () => {
  it("returns content unchanged when it has no Templater directives", async () => {
    const service = build(fakeApp());
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "plain content");
    expectOk(result);
    expect(result.value).toBe("plain content");
  });

  it("returns content unchanged when the Templater plugin is absent", async () => {
    const service = build(fakeApp({ files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% tp.date.now() %>");
    expectOk(result);
    expect(result.value).toBe("<% tp.date.now() %>");
  });

  it("returns content unchanged when the plugin lacks the parse API", async () => {
    const plugin = { templater: { create_running_config: () => ({}) } };
    const service = build(fakeApp({ plugin, files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expectOk(result);
    expect(result.value).toBe("<% x %>");
  });

  it("returns the parsed result when Templater is available", async () => {
    const plugin = {
      templater: {
        create_running_config: () => ({}),
        parse_template: async (_config: unknown, content: string) => `parsed:${content}`,
      },
    };
    const service = build(fakeApp({ plugin, files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expectOk(result);
    expect(result.value).toBe("parsed:<% x %>");
  });

  it("passes the resolved template and target files to create_running_config", async () => {
    const calls: { template: unknown; target: unknown; mode: unknown }[] = [];
    const templateFile = tfile("T.md");
    const targetFile = tfile("N.md");
    const plugin = {
      templater: {
        create_running_config: (template: unknown, target: unknown, mode: unknown) => {
          calls.push({ template, target, mode });
          return {};
        },
        parse_template: async () => "done",
      },
    };
    const service = build(fakeApp({ plugin, files: { "T.md": templateFile, "N.md": targetFile } }));
    await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expect(calls).toEqual([{ template: templateFile, target: targetFile, mode: 0 }]);
  });

  it("returns content unchanged when parse_template throws", async () => {
    const plugin = {
      templater: {
        create_running_config: () => ({}),
        parse_template: async () => {
          throw new Error("boom");
        },
      },
    };
    const service = build(fakeApp({ plugin, files: { "T.md": tfile("T.md"), "N.md": tfile("N.md") } }));
    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, "<% x %>");
    expectOk(result);
    expect(result.value).toBe("<% x %>");
  });
});

describe("TemplaterService.cursorJump", () => {
  it("jumps to the next cursor location when Templater supports it", async () => {
    const jumps: { file: unknown; auto: unknown }[] = [];
    const plugin = {
      templater: { create_running_config: () => ({}), parse_template: async () => "" },
      editor_handler: {
        jump_to_next_cursor_location: async (file: unknown, auto: unknown) => {
          jumps.push({ file, auto });
        },
      },
    };
    const noteFile = tfile("N.md");
    const service = build(fakeApp({ plugin, files: { "N.md": noteFile } }));
    await service.cursorJump("N.md" as VaultPath);
    expect(jumps).toEqual([{ file: noteFile, auto: true }]);
  });

  it("does nothing when the plugin has no editor handler", async () => {
    const plugin = { templater: { create_running_config: () => ({}), parse_template: async () => "" } };
    const service = build(fakeApp({ plugin, files: { "N.md": tfile("N.md") } }));
    const result = await service.cursorJump("N.md" as VaultPath);
    expectOk(result);
  });

  it("absorbs errors thrown by the cursor jump", async () => {
    const plugin = {
      templater: { create_running_config: () => ({}), parse_template: async () => "" },
      editor_handler: {
        jump_to_next_cursor_location: async () => {
          throw new Error("boom");
        },
      },
    };
    const service = build(fakeApp({ plugin, files: { "N.md": tfile("N.md") } }));
    const result = await service.cursorJump("N.md" as VaultPath);
    expectOk(result);
  });
});

describe("TemplaterService.isSupported", () => {
  it("reports supported when the plugin exposes the apply API", () => {
    const plugin = { templater: { create_running_config: () => ({}), parse_template: async () => "" } };
    expect(build(fakeApp({ plugin })).isSupported()).toBe(true);
  });

  it("reports unsupported when the plugin is absent", () => {
    expect(build(fakeApp()).isSupported()).toBe(false);
  });

  it("reports unsupported when the plugin API is incomplete", () => {
    const plugin = { templater: { create_running_config: () => ({}) } };
    expect(build(fakeApp({ plugin })).isSupported()).toBe(false);
  });
});
