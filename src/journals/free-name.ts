/** The first of `first`, `nth(2)`, `nth(3)`… that `taken` rejects. */
export function freeName(first: string, nth: (index: number) => string, taken: (name: string) => boolean): string {
  let candidate = first;
  for (let index = 2; taken(candidate); index++) {
    candidate = nth(index);
  }
  return candidate;
}
