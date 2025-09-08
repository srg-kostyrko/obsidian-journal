import { Injectable } from "@/infra/di/decorators/Injectable";
import type { Templater, TemplaterPlugin } from "./templater.types";

import { Templater as TemplaterToken } from "../plugins.tokens";
import { Result, type AsyncResult } from "@/infra/data-structures/result";
import type { FilePath } from "@/obsidian/contracts/vault.types";
import { TemplaterError } from "./templater.error";
import type { TFile } from "obsidian";
import { inject } from "@/infra/di/inject";
import { ObsidianApp } from "@/obsidian/obsidian.tokens";
import { Logger } from "@/infra/logger/logger.tokens";
import { Option } from "@/infra/data-structures/option";

export
@Injectable(TemplaterToken)
class TemplaterAdapter implements Templater {
  #app = inject(ObsidianApp);
  #logger = inject(Logger, "TemplaterAdapter");

  get isSupported() {
    return this.#canApply;
  }

  get #templater() {
    return Option.fromNullable(this.#app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null);
  }

  get #canApply() {
    return this.#templater
      .map((templater) => {
        if (!("templater" in templater)) return false;
        if (!("create_running_config" in templater.templater)) return false;
        if (!("parse_template" in templater.templater)) return false;
        return true;
      })
      .getOrDefault(false);
  }

  get #canJumpCursor() {
    return this.#templater
      .map((templater) => {
        if (!("editor_handler" in templater)) return false;
        if (!("jump_to_next_cursor_location" in templater.editor_handler)) return false;
        return true;
      })
      .getOrDefault(false);
  }

  apply(templatePath: FilePath, notePath: FilePath, content: string): AsyncResult<string, TemplaterError> {
    return Result.flowBinding(
      this,
      async function* () {
        if (!this.#canApply) return content;
        if (!this.#shouldApply(content)) return content;

        const templateFile = yield* this.#getFile(templatePath);
        const note = yield* this.#getFile(notePath);

        const templater = yield* this.#templater.okOrElse(() => new TemplaterError("Templater not found"));
        const running_config = templater.templater.create_running_config(
          templateFile,
          note,
          0, // RunMode.CreateNewFromTemplate
        );
        return await templater.templater.parse_template(running_config, content);
      },
      (error) => TemplaterError.fromCatch(error),
    )
      .tapErr(this.#logTemplaterError)
      .orElse(() => Result.ok(content));
  }

  jumpCursor(notePath: FilePath): AsyncResult<boolean, TemplaterError> {
    return Result.flowBinding(
      this,
      async function* () {
        if (!this.#canJumpCursor) return false;
        const note = yield* this.#getFile(notePath);
        const templater = yield* this.#templater.okOrElse(() => new TemplaterError("Templater not found"));
        await templater.editor_handler.jump_to_next_cursor_location(note, true);
        return true;
      },
      (error) => TemplaterError.fromCatch(error),
    )
      .tapErr(this.#logTemplaterError)
      .orElse(() => Result.ok(false));
  }

  #shouldApply(content: string) {
    return content.includes("<%") && content.includes("%>");
  }

  #getFile(path: FilePath): Result<TFile, TemplaterError> {
    return Result.fromNullable(
      this.#app.vault.getFileByPath(path),
      () => new TemplaterError(`File not found: ${path}`),
    );
  }

  #logTemplaterError = (error: TemplaterError): void => {
    this.#logger.error(error.message, { error });
  };
}
