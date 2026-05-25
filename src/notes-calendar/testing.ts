import { shallowRef, type ShallowRef } from "vue";

import type { ActiveEntryRef, ActiveEntryViewModel } from "./active-entry";

export class FakeActiveEntryViewModel implements Pick<ActiveEntryViewModel, "active"> {
  readonly active: ShallowRef<ActiveEntryRef | null> = shallowRef(null);

  setActive(ref: ActiveEntryRef | null): void {
    this.active.value = ref;
  }
}
