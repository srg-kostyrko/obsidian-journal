import {
  DecorationsStore,
  toDecorationFlowError,
  UnknownDecorationError,
  UnknownDecorationOwnerError,
  type DecorationOwner,
  type JournalDecoration,
  type JournalDecorationCondition,
} from "@/decorations";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow, type FlowError } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, AsyncResult } from "@/infrastructure/result";
import { JournalsRepository } from "@/journals/repository";

import { CALENDAR_CONDITION_TYPES, conditionTypeOptions } from "../ui/condition-types";
import { editDecorationModal } from "../ui/modals";

export interface EditDecorationParameters {
  owner: DecorationOwner;
  index?: number;
}

export interface EditDecorationResult {
  decoration: JournalDecoration;
  index: number;
}

export class EditDecorationFlow implements Flow<EditDecorationParameters, EditDecorationResult, FlowError> {
  readonly #modals = inject(ModalService);
  readonly #store = inject(DecorationsStore);
  readonly #journals = inject(JournalsRepository);

  #conditionTypes(owner: DecorationOwner): readonly JournalDecorationCondition["type"][] {
    if (owner.kind !== "journal") return CALENDAR_CONDITION_TYPES;
    return this.#journals.get(owner.journalName).match({
      some: (config) => conditionTypeOptions[config.write.type],
      none: () => CALENDAR_CONDITION_TYPES,
    });
  }

  execute(parameters: EditDecorationParameters): AsyncResult<EditDecorationResult, FlowError> {
    const { owner } = parameters;
    if (!this.#store.exists(owner)) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationOwnerError(owner)));
    }
    const decorations = this.#store.list(owner);
    const index = parameters.index;
    const isEdit = index !== undefined;
    if (isEdit && (index < 0 || index >= decorations.length)) {
      return AsyncResult.err(toDecorationFlowError(new UnknownDecorationError(owner, index)));
    }
    const existing = isEdit ? decorations[index] : undefined;
    return attempt.in(this, async function* (this: EditDecorationFlow) {
      const submitted = yield* this.#modals
        .open(editDecorationModal, { decoration: existing, conditionTypes: this.#conditionTypes(owner) })
        .mapErr(() => new UserAborted("edit-decoration-modal"));
      const next = isEdit
        ? decorations.map((d, i) => (i === index ? submitted.decoration : d))
        : [...decorations, submitted.decoration];
      this.#store.save(owner, next);
      return { decoration: submitted.decoration, index: isEdit ? index : decorations.length };
    });
  }
}
