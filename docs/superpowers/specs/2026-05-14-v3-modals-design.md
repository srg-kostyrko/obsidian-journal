# v3 Modals — Design

**Stage:** Modals foundation for the v3 plugin rewrite — a typed, DI-wired
modal service that lives inside the host module.
**Date:** 2026-05-14
**Status:** Draft for review

## Purpose

v2 modals had two recurring pain points:

1. **No typings for input or output.** `VueModal` accepts
   `componentProps: Record<string, unknown>` and surfaces results through
   ad-hoc `emit("close" | "...")` calls. The opening site and the modal SFC
   share no type — props can drift silently, and the caller never sees the
   emitted payload type.
2. **Repeated configuration at every call site.** Title and `customWidth`
   are passed at every `new VueModal(plugin, "Add notes to ...", X, {...}, 700).open()`.
   A modal that needs `--dialog-width: 700px` to look right is a property
   of the modal, not of the caller, yet the caller has to remember it.

v3 closes both gaps by introducing a single modal service inside the host
module:

- A typed factory, `defineModal<TProps, TResult>({...})`, attaches title,
  width, CSS classes, and prop/result types to the modal definition. Each
  modal lives in a `*.modal.ts` file next to its `.modal.vue` SFC.
- `ModalService.open(def, props)` returns
  `AsyncResult<TResult, ModalCancelled>`. Props are inferred from the
  definition; so is the result type.
- The SFC reads submit/cancel through a `useModal<TResult>()` composable —
  no emits, no plugin-singleton provide.

The modals module is `src/infrastructure/host/modals/`, composed into
`createHostModule(plugin)` and re-exported from host's public barrel. Only
one internal file imports Obsidian's `Modal`/`App`/`Plugin`; everything
public is plain v3 (DI tokens, AsyncResult, paraglide messages).

## Non-goals

- No v2 modal ports in this spec. The foundation ships; feature ports land
  with the features that own them.
- No commands, ribbons, menus, views, code blocks, post-processors,
  settings tab, editor service, or templater bridge — each is its own host
  follow-up.
- No `singleInstance` flag, no global "one modal at a time" behavior.
  Modals stack freely; each `open()` resolves independently.
- No timeout, cancellation token, or `.timeout()` helper on the returned
  AsyncResult. Compose at the call site if needed.
- No focus management, autofocus convention, or keyboard-shortcut layer
  beyond what Obsidian and Vue provide by default.
- No live-updating title/width after open. `title(props)` and
  `width(props)` evaluate once when the modal opens. Props inside the SFC
  body remain reactive as usual.
- No `reason` payload or subclass distinction on `ModalCancelled`. A user
  close, a programmatic `cancel()`, and plugin unload all resolve with the
  same single error.
- No ESLint rule restricting `obsidian.Modal` imports outside
  `host/modals/`. The boundary is enforced by what host exports.
- No tests for: the fake, the public barrel, the DI module wiring, or
  the `useModalService()` one-liner.
- No `ConfirmService` / prompt sugar. Deferred until two feature modules
  want it.

## Architecture

### Layout

```
src/infrastructure/host/modals/
├── index.ts                    # re-exported via host's public barrel
├── module.ts                   # createModalsModule(): Module — binds ModalService
├── define-modal.ts             # defineModal() factory + ModalDefinition type
├── use-modal.ts                # useModal<TResult>() composable
├── use-modal-service.ts        # useModalService() DI composable for Vue
├── errors.ts                   # ModalCancelled (extends HostError)
├── types.ts                    # public types
├── internal/
│   ├── modal-service.ts        # ModalService class
│   ├── vue-modal-host.ts       # Obsidian Modal subclass that mounts a Vue app
│   └── modal-context.ts        # provide/inject keys used by useModal()
└── testing.ts                  # FakeModalService + FakeModalHandle
```

`src/infrastructure/host/index.ts` re-exports `ModalService`,
`defineModal`, `useModal`, `useModalService`, `ModalCancelled`, and the
`ModalDefinition` type. `createHostModule(plugin)` composes
`createModalsModule()` alongside the existing host bindings, so a single
host module factory still wires everything.

`internal/vue-modal-host.ts` is the only file in the modals module that
imports `Modal`, `App`, or `Plugin` from `obsidian`. It pulls those via
the host-internal tokens (`InternalPluginToken`, `InternalObsidianAppToken`),
the same way `NotesService` and `WorkspaceService` do today. No raw
`App`/`Plugin` reaches `ModalService`'s callers.

### Public API

```ts
// types.ts
export interface ModalDefinitionInput<TProps, TResult> {
  component: Component;
  title: (props: TProps) => string;
  width?: number | ((props: TProps) => number);
  cssClass?: string | readonly string[];
}

export interface ModalDefinition<TProps, TResult> {
  readonly __props: TProps; // phantom type carrier
  readonly __result: TResult; // phantom type carrier
  readonly component: Component;
  readonly title: (props: TProps) => string;
  readonly width: ((props: TProps) => number) | undefined;
  readonly cssClass: readonly string[];
}

// define-modal.ts
export function defineModal<TProps = void, TResult = void>(
  input: ModalDefinitionInput<TProps, TResult>,
): ModalDefinition<TProps, TResult>;

// internal/modal-service.ts — class also used as DI token (host pattern)
export class ModalService {
  open<TProps, TResult>(def: ModalDefinition<TProps, TResult>, props: TProps): AsyncResult<TResult, ModalCancelled>;
}

// use-modal-service.ts
export function useModalService(): ModalService;

// use-modal.ts
export interface ModalApi<TResult> {
  submit: (value: TResult) => void;
  cancel: () => void;
}
export function useModal<TResult = void>(): ModalApi<TResult>;

// errors.ts
export class ModalCancelled extends HostError {
  constructor() {
    super("Modal was cancelled.");
  }
}
```

`title` requires a function so callers route titles through paraglide
(`@/i18n/paraglide/messages`). Static titles call `m.foo()` inside the
arrow; dynamic ones receive props as the message argument.

`TProps = void` lets argless modals be written as
`defineModal<void, TResult>({...})`. Callers pass `undefined` (a no-arg
overload may be added later if call sites demand it; not in this spec).

### Caller and definition example

Definition next to the SFC:

```ts
// remove-journal.modal.ts
import RemoveJournal from "./RemoveJournal.modal.vue";
import { m } from "@/i18n/paraglide/messages";
import type { NotesProcessing } from "@/feature/journal/types";

export const removeJournalModal = defineModal<{ journalName: string }, NotesProcessing>({
  component: RemoveJournal,
  title: ({ journalName }) => m.modal_removeJournal_title({ journalName }),
  width: 520,
});
```

SFC (props stay normal `defineProps`; no emits; no plugin singleton):

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useModal } from "@/infrastructure/host";

const props = defineProps<{ journalName: string }>();
const { submit, cancel } = useModal<NotesProcessing>();
const choice = ref<NotesProcessing>("keep");
</script>

<template>
  <UiSettingRow :name="m.modal_removeJournal_choiceLabel()">
    <ObsidianDropdown v-model="choice">
      <option value="keep">{{ m.modal_removeJournal_keep() }}</option>
      <option value="clear">{{ m.modal_removeJournal_clear() }}</option>
      <option value="delete">{{ m.modal_removeJournal_delete() }}</option>
    </ObsidianDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <ObsidianButton @click="cancel">{{ m.action_cancel() }}</ObsidianButton>
    <ObsidianButton cta @click="submit(choice)">{{ m.action_remove() }}</ObsidianButton>
  </UiSettingRow>
</template>
```

Call site:

```ts
import { useModalService } from "@/infrastructure/host";
import { removeJournalModal } from "./remove-journal.modal";

const modals = useModalService();
const result = await modals.open(removeJournalModal, { journalName: "Daily" });
// AsyncResult<NotesProcessing, ModalCancelled>
```

Composes inside `attempt.in`:

```ts
const processing = yield * modals.open(removeJournalModal, { journalName });
```

### Service internals & lifecycle

```ts
export class ModalService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #open = new Set<VueModalHost>();

  constructor() {
    this.#plugin.register(() => {
      for (const host of this.#open) host.dismiss();
    });
  }

  open<TProps, TResult>(def: ModalDefinition<TProps, TResult>, props: TProps): AsyncResult<TResult, ModalCancelled> {
    const { promise, resolve } = Promise.withResolvers<Result<TResult, ModalCancelled>>();
    const host = new VueModalHost(this.#app, this.#plugin, def, props, resolve);
    this.#open.add(host);
    host.onAfterClose = () => this.#open.delete(host);
    host.open();
    return AsyncResult.fromPromise(promise);
  }
}
```

`VueModalHost` extends Obsidian's `Modal`:

- `onOpen` sets `titleEl` to `def.title(props)`, applies `--dialog-width`
  from `def.width?.(props)`, adds `cssClass` entries to `modalEl`.
- Creates a Vue app rooted at `def.component` with the typed `props`.
- Provides the modal context (`{ submit, cancel }`) for `useModal()` to
  inject.
- Provides the v3 DI injector so DI-aware composables (e.g.
  `useModalService` itself, future `useXxxService` helpers) keep working
  inside modal SFCs.
- `submit(value)` and `cancel()` guard against double-fire, call
  `this.close()`, and resolve the outer promise with `Ok(value)` /
  `Err(new ModalCancelled())` respectively.
- `onClose` (fired by Obsidian on Esc / backdrop / X _or_ after our
  `close()`) unmounts the Vue app, empties `contentEl`, and — if the
  promise is still unresolved — resolves it with
  `Err(new ModalCancelled())`. This is how user-initiated dismissals
  become `ModalCancelled`.
- `dismiss()` (called on plugin unload) just calls `close()`. `onClose`
  handles the resolution. Plugin teardown is indistinguishable from any
  other cancel — single error variant by design.

### Errors

`errors.ts` exports `ModalCancelled extends HostError`. One error class.
No subclasses, no reason payload.

### DI module

```ts
// module.ts
export function createModalsModule(): Module {
  return {
    register(c) {
      c.register(ModalService).useClass(ModalService).eager();
    },
  };
}
```

Composed into `createHostModule(plugin)` alongside the existing host
bindings. `ModalService` is eager via the existing autoLoad step
(`feedback_di_eager_autoload`). Container lifetime is the default and
is not spelled out (`feedback_di_omit_default_lifetime`).

### Test fake

```ts
// testing.ts
export class FakeModalHandle<TProps, TResult> {
  readonly def: ModalDefinition<TProps, TResult>;
  readonly props: TProps;
  readonly resolvedTitle: string;
  readonly resolvedWidth: number | undefined;
  submit(value: TResult): void;
  cancel(): void;
  get settled(): boolean;
}

export class FakeModalService {
  readonly opens: ReadonlyArray<FakeModalHandle<unknown, unknown>>;
  open<TProps, TResult>(def: ModalDefinition<TProps, TResult>, props: TProps): AsyncResult<TResult, ModalCancelled>;
  lastOpen<TProps = unknown, TResult = unknown>(): FakeModalHandle<TProps, TResult>;
  dismissAll(): void;
}
```

Behavior:

- `open(def, props)` evaluates `def.title(props)` and `def.width?.(props)`
  eagerly so tests can assert the rendered title without mounting a real
  SFC. Pushes a new `FakeModalHandle` onto `opens` and returns a pending
  `AsyncResult`.
- `submit(value)` resolves with `Ok(value)`; `cancel()` resolves with
  `Err(new ModalCancelled())`. Idempotent — a second call is a no-op.
- `lastOpen()` returns the most recent handle and throws if none exists,
  so tests fail loudly when assertions run before any modal opens.
- `dismissAll()` cancels every unsettled handle, simulating plugin
  teardown.
- The fake has no error-queue API. Tests inject failures by spying on the
  collaborators the SFC would call, not on the fake itself
  (`feedback_no_baked_in_error_simulation`).
- The fake is test infrastructure and is not itself tested
  (`feedback_no_mock_fake_tests`).

Tests register it via DI:

```ts
const modals = new FakeModalService();
container.register(ModalService).useValue(modals);

await someFlow();
expect(modals.lastOpen().resolvedTitle).toBe("Remove Daily journal");
modals.lastOpen<{ journalName: string }, NotesProcessing>().submit("delete");
```

## Testing strategy

`ModalService` — unit tests against the real class with a stub `Plugin`
and `App`. One behavior per test
(`feedback_one_behavior_per_test`); assertions are on the AsyncResult
outcome or on observable Obsidian-side effects, not on internal sets or
call counts (`feedback_black_box_assertions`).

Covered behaviors:

- `open()` resolves with `Ok(value)` when the SFC calls `submit(value)`.
- `open()` resolves with `Err(ModalCancelled)` when the SFC calls
  `cancel()`.
- `open()` resolves with `Err(ModalCancelled)` when Obsidian closes the
  modal (Esc / backdrop / X — simulated by invoking the underlying
  `Modal.close()`).
- `open()` resolves with `Err(ModalCancelled)` when the plugin unload
  callback fires.
- Two concurrent `open()` calls resolve independently in the order they
  settle.
- A `submit` after `cancel` (or vice versa) does not re-resolve the
  AsyncResult.
- `def.title(props)` is applied to `titleEl`.
- `def.width(props)` sets `--dialog-width`.
- `def.cssClass` entries are added to `modalEl`.

`defineModal` — type-level tests only, using `expectTypeOf`
(`feedback_test_hygiene`). Asserts that `defineModal<TProps, TResult>({...})`
produces `ModalDefinition<TProps, TResult>` and that
`ModalService.open(def, props)` infers
`AsyncResult<TResult, ModalCancelled>`. No runtime test — the factory is
a pass-through (`feedback_no_trivial_tests`).

`useModal` — one component test using `@testing-library/vue` and
`user-event` (`feedback_testing_library_for_components`). A small harness
component calls `useModal<string>()` and is mounted inside a provider
that supplies the modal context. One test asserts that clicking the
"submit" button delivers the value to the captured context callback; one
asserts the same for "cancel". No real modal chrome is mounted.

Not tested: `useModalService()` (one-line wrapper, `feedback_no_wiring_tests`),
`ModalCancelled` (`feedback_no_trivial_tests`), the public barrel,
`createModalsModule()` / `createHostModule()` composition, and
`FakeModalService` (`feedback_no_mock_fake_tests`).

Quality gates per `feedback_test_commands`: `npm test`,
`npm run check:types`, `npm run check:lint` on every change. Per-spec
gate adds `npm run test:e2e:smoke`. No new e2e flows here — the
foundation ships no end-user UI surface; the first feature port that
uses a modal owns its e2e coverage.

## Deliverables

1. `src/infrastructure/host/modals/` per the layout above.
2. Public API per the section above, re-exported from
   `src/infrastructure/host/index.ts`.
3. `VueModalHost` internal — sole importer of `obsidian.Modal`.
4. DI wiring: `createModalsModule()` composed into
   `createHostModule(plugin)`; `ModalService` eager via the existing
   autoLoad step.
5. `FakeModalService` + `FakeModalHandle` in
   `src/infrastructure/host/modals/testing.ts`, re-exported from the
   host _testing_ barrel (separate from the main barrel, per
   `feedback_barrel_files`).
6. Tests per the testing strategy above.

## Open follow-ups

Each gets its own spec when needed:

- Per-feature modal ports (calendar week settings, create/remove journal,
  connect note, etc.) as v3 features land.
- Optional `ConfirmService` built on top of `ModalService` — a small
  confirm/prompt helper. Deferred until two feature modules want it.
