import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";
import { CodeBlockDefinitionToken, type CodeBlockDefinition } from "../types";

export class CodeBlockService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #logger = inject(LoggerFactoryToken).named("code-block-service");
  readonly #definitions = inject(CodeBlockDefinitionToken);

  constructor() {
    for (const definition of this.#definitions) this.#registerDefinition(definition);
  }

  #registerDefinition(definition: CodeBlockDefinition): void {
    for (const key of definition.keys) {
      this.#plugin.registerMarkdownCodeBlockProcessor(key, () => {
        this.#logger.debug("code-block processor invoked", { key });
      });
    }
  }
}
