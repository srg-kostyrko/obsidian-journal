export type UriParameters = Record<string, string>;

export type UriHandler = (parameters: UriParameters) => void;
