export interface Token<_T> {
  readonly name: string;
}

export interface Constructor<Instance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): Instance;
  readonly name: string;
}
