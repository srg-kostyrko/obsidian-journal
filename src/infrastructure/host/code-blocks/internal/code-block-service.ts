import { parseYaml } from "obsidian";
import * as v from "valibot";

import { inject, InjectorToken } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";
import { CodeBlockSchemaError, CodeBlockYamlError } from "../errors";
import { CodeBlockDefinitionToken, type CodeBlockDefinition, type CodeBlockProps } from "../types";

import { VueCodeBlockHost } from "./vue-code-block-host";

import type { VaultPath } from "../../types";
import type { BaseIssue, GenericSchema, InferOutput } from "valibot";

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
      this.#renderError(element, parsed.error.message);
      return;
    }
    const validated = v.safeParse(definition.schema, parsed.value);
    if (!validated.success) {
      const error = new CodeBlockSchemaError(key, validated.issues);
      this.#logger.error("code-block schema validation failed", { key, path, issues: validated.issues });
      this.#renderError(element, error.message, validated.issues);
      return;
    }
    const props: CodeBlockProps<InferOutput<TSchema>> = { path, config: validated.output };
    attach(
      new VueCodeBlockHost(
        element,
        this.#injector,
        definition.component,
        props as unknown as Record<string, unknown>,
        definition.cssClass,
      ),
    );
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

  #renderError(element: HTMLElement, message: string, issues?: readonly BaseIssue<unknown>[]): void {
    element.replaceChildren();
    const root = document.createElement("div");
    root.className = "code-block-error";
    const head = document.createElement("div");
    head.textContent = message;
    root.append(head);
    if (issues && issues.length > 0) {
      const list = document.createElement("ul");
      for (const issue of issues) {
        const pathSegments = Array.isArray(issue.path)
          ? issue.path.map((segment: { key?: unknown }) => String(segment.key)).join(".")
          : "";
        const item = document.createElement("li");
        item.textContent = pathSegments ? `${pathSegments}: ${issue.message}` : issue.message;
        list.append(item);
      }
      root.append(list);
    }
    element.append(root);
  }
}
