declare const anchorBrand: unique symbol;

export type AnchorString = string & { readonly [anchorBrand]: true };
