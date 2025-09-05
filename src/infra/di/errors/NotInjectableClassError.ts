export class NotInjectableClassError extends Error {
  constructor(name: string) {
    super(`Class ${name} does not provide a token - it should be decorated with @Injectable`);
  }
}
