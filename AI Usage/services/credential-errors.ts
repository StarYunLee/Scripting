export class CredentialPersistenceError extends Error {
  readonly code = "credential_persist_failed";

  constructor(message = "新 Token 获取成功，但本机凭据保存失败") {
    super(message);
    this.name = "CredentialPersistenceError";
  }
}

export function isCredentialPersistenceError(
  error: unknown,
): error is CredentialPersistenceError {
  return (
    error instanceof CredentialPersistenceError ||
    (error instanceof Error && error.name === "CredentialPersistenceError")
  );
}

export function credentialPersistenceFailure(error: unknown): {
  code: "credential_persist_failed";
  message: string;
} | null {
  return isCredentialPersistenceError(error)
    ? { code: error.code, message: error.message }
    : null;
}
