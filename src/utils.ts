import { nanoid } from "nanoid";

export function deepCopy<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}

export function generateId(): string {
  return nanoid(10);
}
