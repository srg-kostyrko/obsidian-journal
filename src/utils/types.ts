export function checkExhaustive(_value: never): never {
  throw new Error(`Unexpected value`);
}
