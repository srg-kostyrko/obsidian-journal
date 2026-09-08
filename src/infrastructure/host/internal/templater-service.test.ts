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

describe("TemplaterService.templatesFolder", () => {
  it("returns the configured Templater templates folder", () => {
    const plugin = { settings: { templates_folder: "Meta/Templater" } };
    expect(build(fakeApp({ plugin })).templatesFolder()).toBe("Meta/Templater");
  });

  it("returns null when the Templater plugin is absent", () => {
    expect(build(fakeApp()).templatesFolder()).toBeNull();
  });

  it("returns null when the plugin has no templates_folder setting", () => {
    const plugin = { settings: {} };
    expect(build(fakeApp({ plugin })).templatesFolder()).toBeNull();
  });
});

// Templater resolves `tp.file.include` by reading the sub-template off disk and re-entering
// its own parser with it, so the plugin's `{{ }}` pass — which ran over the parent's body
// before Templater ever saw it — never reaches that content. The fake below mirrors that
// re-entry through `plugin.templater.parser.parse_commands`, the seam the service hooks.
function includingPlugin(includes: Record<string, string> = {}, gates: Record<string, Promise<void>> = {}) {
  const plugin = {
    templater: {
      parser: {
        parse_commands: async (content: string, functionsObject: unknown): Promise<string> => {
          const match = /<% tp\.file\.include\("([^"]+)"\) %>/.exec(content);
          if (match === null) return content;
          const nested = await plugin.templater.parser.parse_commands(includes[match[1]] ?? "", functionsObject);
          return content.replace(match[0], () => nested);
        },
      },
      create_running_config: (template_file: TFile | undefined, target_file: TFile, run_mode: number) => ({
        template_file,
        target_file,
        run_mode,
      }),
      parse_template: async (config: { target_file: TFile }, content: string): Promise<string> => {
        await gates[config.target_file.path];
        return plugin.templater.parser.parse_commands(content, { config });
      },
    },
  };
  return plugin;
}

describe("TemplaterService.apply nested content", () => {
  const files = { "T.md": tfile("T.md"), "N.md": tfile("N.md") };
  const body = '<% tp.file.include("Sub") %>';

  it("renders a sub-template Templater includes through the nested renderer", async () => {
    const service = build(fakeApp({ plugin: includingPlugin({ Sub: "sub says {{date}}" }), files }));

    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, `intro ${body}`, (raw) =>
      raw.replaceAll("{{date}}", "2026-05-19"),
    );

    expectOk(result);
    expect(result.value).toBe("intro sub says 2026-05-19");
  });

  it("renders a sub-template's variables before Templater parses its commands", async () => {
    const includes = { Sub: '<% "{{date}}" %>' };
    const plugin = includingPlugin(includes);
    // Stand in for Templater evaluating the command: by the time the parser sees it, the
    // variable must already be gone, which a pass running after Templater cannot deliver.
    const inner = plugin.templater.parser.parse_commands;
    plugin.templater.parser.parse_commands = async (content: string, functionsObject: unknown): Promise<string> => {
      const parsed = await inner(content, functionsObject);
      return parsed.replace(/<% "([^"]*)" %>/, "$1");
    };
    const service = build(fakeApp({ plugin, files }));

    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, body, (raw) =>
      raw.replaceAll("{{date}}", "2026-05-19"),
    );

    expectOk(result);
    expect(result.value).toBe("2026-05-19");
  });

  it("does not re-render the content it was handed", async () => {
    const service = build(fakeApp({ plugin: includingPlugin({ Sub: "sub" }), files }));
    const seen: string[] = [];

    await service.apply("T.md" as VaultPath, "N.md" as VaultPath, `top {{date}} ${body}`, (raw) => {
      seen.push(raw);
      return raw;
    });

    expect(seen).toEqual(["sub"]);
  });

  it("leaves nested content untouched when no nested renderer is given", async () => {
    const service = build(fakeApp({ plugin: includingPlugin({ Sub: "sub says {{date}}" }), files }));

    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, body);

    expectOk(result);
    expect(result.value).toBe("sub says {{date}}");
  });

  it("leaves content Templater parses for another target untouched", async () => {
    const plugin = includingPlugin({ Sub: "sub" });
    const parse = plugin.templater.parse_template;
    let alien = "";
    plugin.templater.parse_template = async (config: { target_file: TFile }, content: string): Promise<string> => {
      alien = await plugin.templater.parser.parse_commands("alien {{date}}", {
        config: { target_file: tfile("Other.md") },
      });
      return parse(config, content);
    };
    const service = build(fakeApp({ plugin, files: { ...files, "Other.md": tfile("Other.md") } }));

    await service.apply("T.md" as VaultPath, "N.md" as VaultPath, body, (raw) =>
      raw.replaceAll("{{date}}", "2026-05-19"),
    );

    expect(alien).toBe("alien {{date}}");
  });

  it("renders each concurrent apply's includes with its own renderer", async () => {
    const held = Promise.withResolvers<void>();
    const plugin = includingPlugin({ Sub: "{{who}}" }, { "A.md": held.promise });
    const service = build(
      fakeApp({ plugin, files: { "T.md": tfile("T.md"), "A.md": tfile("A.md"), "B.md": tfile("B.md") } }),
    );

    const first = service.apply("T.md" as VaultPath, "A.md" as VaultPath, body, (raw) =>
      raw.replaceAll("{{who}}", "first"),
    );
    const second = await service.apply("T.md" as VaultPath, "B.md" as VaultPath, body, (raw) =>
      raw.replaceAll("{{who}}", "second"),
    );
    held.resolve();

    expectOk(second);
    expect(second.value).toBe("second");
    const firstResult = await first;
    expectOk(firstResult);
    expect(firstResult.value).toBe("first");
  });

  it("keeps the nested content when the nested renderer throws", async () => {
    const service = build(fakeApp({ plugin: includingPlugin({ Sub: "sub says {{date}}" }), files }));

    const result = await service.apply("T.md" as VaultPath, "N.md" as VaultPath, body, () => {
      throw new Error("boom");
    });

    expectOk(result);
    expect(result.value).toBe("sub says {{date}}");
  });

  it("restores Templater's own parser once the template is applied", async () => {
    const plugin = includingPlugin({ Sub: "sub" });
    const original = plugin.templater.parser.parse_commands;
    const service = build(fakeApp({ plugin, files }));

    await service.apply("T.md" as VaultPath, "N.md" as VaultPath, body, (raw) => raw);

    expect(plugin.templater.parser.parse_commands).toBe(original);
  });

  it("restores Templater's own parser when parsing throws", async () => {
    const plugin = includingPlugin({ Sub: "sub" });
    const original = plugin.templater.parser.parse_commands;
    plugin.templater.parse_template = async (): Promise<string> => {
      throw new Error("boom");
    };
    const service = build(fakeApp({ plugin, files }));

    await service.apply("T.md" as VaultPath, "N.md" as VaultPath, body, (raw) => raw);

    expect(plugin.templater.parser.parse_commands).toBe(original);
  });
});
