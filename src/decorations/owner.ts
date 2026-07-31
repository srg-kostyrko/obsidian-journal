import { match } from "ts-pattern";

export type DecorationOwner =
  | { readonly kind: "journal"; readonly journalName: string }
  | { readonly kind: "shelf"; readonly shelfName: string }
  | { readonly kind: "global" };

export type CalendarDecorationOwner = Exclude<DecorationOwner, { kind: "journal" }>;

export function describeOwner(owner: DecorationOwner): string {
  return match(owner)
    .with({ kind: "journal" }, ({ journalName }) => `journal=${journalName}`)
    .with({ kind: "shelf" }, ({ shelfName }) => `shelf=${shelfName}`)
    .with({ kind: "global" }, () => "global")
    .exhaustive();
}
