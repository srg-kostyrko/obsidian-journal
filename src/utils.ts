export function deepCopy<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}
