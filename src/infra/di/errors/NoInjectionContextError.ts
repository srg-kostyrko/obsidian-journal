export class NoInjectionContextError extends Error {
  constructor(name: string) {
    super(`${name}() can only be used within an injection context`);
  }
}
