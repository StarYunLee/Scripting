import { captureCredentialGuard } from "../auth/token";

export { captureCredentialGuard };

/** Guard both dispatch and completion; rejected old work must not start recovery requests. */
export async function sessionAwait<T>(
  task: () => Promise<T>,
  guard: () => void,
): Promise<T> {
  guard();
  try {
    const result = await task();
    guard();
    return result;
  } catch (error) {
    guard();
    throw error;
  }
}
