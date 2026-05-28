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
  readonly kind = "invalid-update" as const;
  constructor(public readonly viewId: ViewId) {
    super(`Invalid update for view ${viewId}: id field is immutable via update`);
    this.name = "InvalidViewUpdateError";
  }
}

export type ViewsLifecycleError = InvalidViewNameError;
