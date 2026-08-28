import { MissingProfilePatError } from "./errors";
import { getGithubAvailability } from "./github";

/** 业务层写仓库前的最终门禁；UI 可在调用前提供更友好的引导。 */
export function assertCanWriteGithub(profileId: string): void {
  const availability = getGithubAvailability(profileId);
  if (availability.hasPat) {
    return;
  }
  throw new MissingProfilePatError(profileId);
}
