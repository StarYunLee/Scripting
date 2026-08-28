import type { MinimaxRegion } from "./types";
import { regionProbeOrder } from "./regions";
import { hasMinimaxQuotaRows } from "./usage-parser";

export type MinimaxRegionProbe = (region: MinimaxRegion) => Promise<unknown>;

export async function chooseMinimaxRegion(
  preferred: MinimaxRegion | null | undefined,
  probe: MinimaxRegionProbe,
): Promise<MinimaxRegion | null> {
  for (const region of regionProbeOrder(preferred)) {
    const payload = await probe(region);
    if (hasMinimaxQuotaRows(payload)) return region;
  }
  return null;
}
