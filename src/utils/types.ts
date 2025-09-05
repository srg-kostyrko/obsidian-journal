export function checkExhaustive(_value: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unexpected value ${_value}`);
}
