export function deepCopy<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
