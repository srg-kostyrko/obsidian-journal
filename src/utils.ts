export function deepCopy<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
