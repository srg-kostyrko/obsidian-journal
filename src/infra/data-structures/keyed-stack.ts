export class KeyedStack<K extends object, V> {
  private entries = new Array<{ key: K; value: V }>();

  private keys = new WeakSet<K>();

  toString() {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return this.entries.map(({ key }) => key.toString()).join(" -> ");
  }

  has(key: K) {
    return this.keys.has(key);
  }

  peek() {
    const entry = this.entries.at(-1);
    return entry?.value;
  }

  push(key: K, value: V) {
    this.keys.add(key);
    this.entries.push({ key, value });
    return () => {
      this.entries.pop();
      this.keys.delete(key);
    };
  }
}
