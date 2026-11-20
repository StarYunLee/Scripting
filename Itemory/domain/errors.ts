export type ItemoryErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "STORAGE"
  | "PRO_REQUIRED"
  | "SCHEMA_MISMATCH"
  | "PENDING_MUTATION"
  | "DATA_CORRUPTION";

export class ItemoryError extends Error {
  readonly code: ItemoryErrorCode;
  readonly cause?: unknown;

  constructor(code: ItemoryErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ItemoryError";
    this.code = code;
    this.cause = cause;
  }
}

export function itemoryError(code: ItemoryErrorCode, message: string, cause?: unknown): ItemoryError {
  return new ItemoryError(code, message, cause);
}

export function isItemoryError(error: unknown, code?: ItemoryErrorCode): error is ItemoryError {
  return error instanceof ItemoryError && (code === undefined || error.code === code);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
