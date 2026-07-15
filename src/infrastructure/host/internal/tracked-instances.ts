interface Registrable {
  register(callback: () => void): void;
}

/**
 * A set of live transient-UI instances (modals, suggest popups) that closes them
 * all on plugin unload. Concentrates the "track open instances, tear all down on
 * unload" wiring the modal / suggest / input-suggest services each hand-rolled.
 */
export class TrackedInstances<T> {
  readonly #instances = new Set<T>();

  constructor(plugin: Registrable, close: (instance: T) => void) {
    plugin.register(() => {
      for (const instance of this.#instances) close(instance);
      this.#instances.clear();
    });
  }

  add(instance: T): void {
    this.#instances.add(instance);
  }

  delete(instance: T): void {
    this.#instances.delete(instance);
  }
}
