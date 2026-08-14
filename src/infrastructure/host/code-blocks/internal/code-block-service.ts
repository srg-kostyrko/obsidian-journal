import { parseYaml } from "obsidian";
import * as v from "valibot";

import { formatConjunction, m } from "@/i18n";
import { inject, InjectorToken } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";
import { CodeBlockYamlError } from "../errors";
import { CodeBlockDefinitionToken, type CodeBlockDefinition, type CodeBlockProps } from "../types";

import { VueCodeBlockHost } from "./vue-code-block-host";

import type { VaultPath } from "../../types";
import type { BaseIssue, GenericSchema, InferOutput } from "valibot";

function detailOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class CodeBlockService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #injector = inject(InjectorToken);
  readonly #logger = inject(LoggerFactoryToken).named("code-block-service");
  readonly #definitions = inject(CodeBlockDefinitionToken);

  constructor() {
    for (const definition of this.#definitions) this.#registerDefinition(definition);
  }

  #registerDefinition<TSchema extends GenericSchema>(definition: CodeBlockDefinition<TSchema>): void {
    for (const key of definition.keys) {
      this.#plugin.registerMarkdownCodeBlockProcessor(key, (source, element, context) => {
        this.#renderBlock(definition, key, source, element, context.sourcePath as VaultPath, (child) =>
          context.addChild(child),
        );
      });
    }
  }

  #renderBlock<TSchema extends GenericSchema>(
    definition: CodeBlockDefinition<TSchema>,
    key: string,
    source: string,
    element: HTMLElement,
    path: VaultPath,
    attach: (child: VueCodeBlockHost) => void,
  ): void {
    const parsed = this.#parseYaml(source);
    if (parsed.kind === "err") {
      this.#logger.error("code-block yaml parse failed", { key, path, cause: parsed.error.cause });
      // The parser's own message carries the line, the column and an excerpt with a caret —
      // everything the user needs to fix it, and previously console-only.
      this.#renderError(element, m.code_blocks_yaml_error({ key }), { detail: detailOf(parsed.error.cause) });
      return;
    }
    const validated = v.safeParse(definition.schema, parsed.value);
    if (!validated.success) {
      this.#logger.error("code-block schema validation failed", { key, path, issues: validated.issues });
      this.#renderError(element, m.code_blocks_schema_error({ key }), { issues: validated.issues });
      return;
    }
    const props: CodeBlockProps<InferOutput<TSchema>> = { path, config: validated.output };
    const unknownKeys = this.#unknownKeys(definition, parsed.value);
    if (unknownKeys.length > 0) {
      this.#logger.warn("code-block ignored unrecognized keys", { key, path, keys: unknownKeys });
    }
    attach(
      new VueCodeBlockHost(
        element,
        this.#injector,
        definition.component,
        props as unknown as Record<string, unknown>,
        definition.cssClass,
        unknownKeys.length > 0
          ? m.code_blocks_unknown_keys({ count: unknownKeys.length, keys: formatConjunction(unknownKeys) })
          : undefined,
      ),
    );
  }

  // Only a block that declares its options can tell a typo from a key it never had.
  #unknownKeys(definition: CodeBlockDefinition, parsed: unknown): string[] {
    const known = definition.knownKeys;
    if (known === undefined) return [];
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
    return Object.keys(parsed).filter((k) => !known.includes(k));
  }

  #parseYaml(source: string): { kind: "ok"; value: unknown } | { kind: "err"; error: CodeBlockYamlError } {
    const trimmed = source.trim();
    if (trimmed === "") return { kind: "ok", value: {} };
    try {
      return { kind: "ok", value: parseYaml(source.replaceAll("\t", "  ")) };
    } catch (error) {
      return { kind: "err", error: new CodeBlockYamlError(error) };
    }
  }

  #renderError(
    element: HTMLElement,
    message: string,
    { detail, issues }: { detail?: string; issues?: readonly BaseIssue<unknown>[] } = {},
  ): void {
    element.replaceChildren();
    const root = element.createDiv({ cls: "code-block-error" });
    root.createDiv({ text: message });
    if (detail !== undefined && detail !== "") {
      // Monospace and preserved whitespace: the parser aligns a caret under the offending
      // column, which only lines up in a <pre>.
      root.createEl("pre", { cls: "code-block-error__detail", text: detail });
    }
    if (issues && issues.length > 0) {
      const list = root.createEl("ul");
      for (const issue of issues) {
        const pathSegments = Array.isArray(issue.path)
          ? issue.path.map((segment: { key?: unknown }) => String(segment.key)).join(".")
          : "";
        list.createEl("li", { text: pathSegments ? `${pathSegments}: ${issue.message}` : issue.message });
      }
    }
  }
}
