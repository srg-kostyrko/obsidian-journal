import type { AnswerIssue, JournalsApiErrorCode } from "./public-api";

/**
 * The only error shape that crosses the plugin boundary. Consumers discriminate on
 * `code` — never `instanceof`, because the published package ships no constructor.
 */
export class ApiError extends Error {
  constructor(
    readonly code: JournalsApiErrorCode,
    message: string,
    readonly journal?: string,
    readonly issues?: readonly AnswerIssue[],
  ) {
    super(message);
    this.name = "JournalsApiError";
  }
}
