import {
  createAuthorizationAbort,
  AuthorizationCancelledError,
  type AuthorizationSignal,
} from "./auth-errors";

export class AuthorizationCheckDeferred extends Error {
  constructor(message = "尚未完成授权，请继续在网页中完成登录") {
    super(message);
    this.name = "AuthorizationCheckDeferred";
  }
}

/** Deadline fences late token responses; never destroys the OAuth session. */
export async function checkAuthorizationOnce<T>(
  task: (signal: AuthorizationSignal) => Promise<T>,
  parent?: AuthorizationSignal,
  budgetMs = 5000,
): Promise<T> {
  if (parent?.aborted) throw new AuthorizationCancelledError();
  const child = createAuthorizationAbort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      child.abort();
      reject(
        new AuthorizationCheckDeferred("暂时无法确认授权结果，请稍后继续授权"),
      );
    }, budgetMs);
    unsubscribe =
      parent?.subscribe(() => {
        child.abort();
        reject(new AuthorizationCancelledError());
      }) || (() => {});
  });
  try {
    if (parent?.aborted) throw new AuthorizationCancelledError();
    return await Promise.race([task(child), stop]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe();
    child.abort();
  }
}
