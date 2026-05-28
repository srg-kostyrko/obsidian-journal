import { FlowError } from "@/infrastructure/flows";

import type { BlockInstanceId, ViewId } from "./config";
import type { BaseIssue } from "valibot";

export class UnknownViewError extends Error {
  readonly kind = "unknown-view" as const;
  constructor(public readonly viewId: ViewId) {
    super(`Unknown view: ${viewId}`);
    this.name = "UnknownViewError";
  }
}

export class DuplicateBlockInstanceIdError extends Error {
  readonly kind = "duplicate-block-instance-id" as const;
  constructor(
    public readonly viewId: ViewId,
    public readonly blockId: BlockInstanceId,
  ) {
    super(`Duplicate block instance id in view ${viewId}: ${blockId}`);
    this.name = "DuplicateBlockInstanceIdError";
  }
}

export class UnknownViewBlockKeyError extends Error {
  readonly kind = "unknown-view-block-key" as const;
  constructor(public readonly key: string) {
    super(`Unknown view-block key: ${key}`);
    this.name = "UnknownViewBlockKeyError";
  }
}

export class InvalidViewBlockConfigError extends Error {
  readonly kind = "invalid-view-block-config" as const;
  constructor(
    public readonly viewId: ViewId,
    public readonly blockId: BlockInstanceId,
    public readonly key: string,
    public readonly issues: readonly BaseIssue<unknown>[],
  ) {
    super(`Invalid config for view-block ${key} in view ${viewId} (instance ${blockId})`);
    this.name = "InvalidViewBlockConfigError";
  }
}

export class InvalidViewNameError extends Error {
  readonly kind = "invalid-view-name" as const;
  constructor(public readonly attemptedName: string) {
    super(`Invalid view name: ${attemptedName}`);
    this.name = "InvalidViewNameError";
  }
}

export class InvalidViewUpdateError extends Error {
  readonly kind = "invalid-view-update" as const;
  constructor(public readonly viewId: ViewId) {
    super(`Invalid update for view ${viewId}: id field is immutable via update`);
    this.name = "InvalidViewUpdateError";
  }
}

export class ViewsInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewsInvariantError";
  }
}

export class MissingViewContextProviderError extends Error {
  readonly kind = "missing-view-context-provider" as const;
  constructor() {
    super("useViewContext called outside a provideViewContext scope");
    this.name = "MissingViewContextProviderError";
  }
}

export type ViewsLifecycleError = InvalidViewNameError | UnknownViewError | UnknownViewBlockKeyError;

export class ViewsLifecycleFlowError extends FlowError {
  readonly kind = "views-lifecycle" as const;
  constructor(public override readonly cause: ViewsLifecycleError) {
    super(cause.message);
    this.name = "ViewsLifecycleFlowError";
  }
}

export function toFlowError(cause: ViewsLifecycleError): ViewsLifecycleFlowError {
  return new ViewsLifecycleFlowError(cause);
}
