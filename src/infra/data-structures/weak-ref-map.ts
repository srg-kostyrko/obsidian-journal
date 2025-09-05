export class WeakRefMap<K extends WeakKey, V extends object> {
  #map = new WeakMap<K, WeakRef<V>>();

  get(key: K) {
    const ref = this.#map.get(key);
    if (ref) {
      const value = ref.deref();
      if (value) {
        return value;
      }
      this.#map.delete(key);
    }
  }

  set(key: K, value: V) {
    this.#map.set(key, new WeakRef(value));
    return () => {
      this.#map.delete(key);
    };
  }
}
