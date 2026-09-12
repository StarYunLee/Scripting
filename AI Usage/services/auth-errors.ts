export class AuthorizationCancelledError extends Error {
  readonly code = "authorization_cancelled";

  constructor(message = "已取消授权") {
    super(message);
    this.name = "AuthorizationCancelledError";
  }
}

export function isAuthorizationCancelledError(
  error: unknown,
): error is AuthorizationCancelledError {
  return (
    error instanceof AuthorizationCancelledError ||
    (error instanceof Error && error.name === "AuthorizationCancelledError")
  );
}

export type AuthorizationSignal = {
  readonly aborted: boolean;
  subscribe(listener: () => void): () => void;
};

export type AuthorizationAbort = AuthorizationSignal & {
  abort(): void;
};

export function createAuthorizationAbort(): AuthorizationAbort {
  let aborted = false;
  const listeners = new Set<() => void>();
  return {
    get aborted() {
      return aborted;
    },
    abort() {
      if (aborted) return;
      aborted = true;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
    subscribe(listener) {
      if (aborted) {
        listener();
        return () => undefined;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function throwIfAuthorizationCancelled(
  signal?: AuthorizationSignal,
): void {
  if (!signal?.aborted) return;
  throw new AuthorizationCancelledError();
}

export function createAuthorizationGuard<T extends object>(
  pending: T,
  readPending: () => T | null,
  signal?: AuthorizationSignal,
): () => void {
  const identity = JSON.stringify(pending);
  return () => {
    throwIfAuthorizationCancelled(signal);
    if (JSON.stringify(readPending()) !== identity) {
      throw new AuthorizationCancelledError("授权会话已变化");
    }
  };
}

export function waitForAuthorization(
  ms: number,
  signal?: AuthorizationSignal,
): Promise<void> {
  throwIfAuthorizationCancelled(signal);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      unsubscribe();
      reject(new AuthorizationCancelledError());
    };
    const timer = setTimeout(() => {
      unsubscribe();
      resolve();
    }, ms);
    const unsubscribe = signal?.subscribe(onAbort) || (() => undefined);
  });
}
