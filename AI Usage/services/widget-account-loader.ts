import type { ProviderId } from "../models";
import { getSnapshotProvider } from "../providers/snapshot-registry";
import { getWidgetRefreshProvider } from "../providers/usage-registry";
import {
  getWidgetRefreshMetadata,
  setWidgetRefreshMetadata,
} from "./widget-refresh-metadata";
import {
  loadWidgetAccountSnapshotWith,
  type LoadedWidgetSnapshot,
} from "./widget-account-loader-core";

export function loadWidgetAccountSnapshot(input: {
  provider: ProviderId;
  profileId: string;
  reloadMinutes: number;
}): Promise<LoadedWidgetSnapshot> {
  const snapshotProvider = getSnapshotProvider(input.provider);
  const refreshProvider = getWidgetRefreshProvider(input.provider);
  return loadWidgetAccountSnapshotWith(input, {
    readSnapshot: () => snapshotProvider.cache(input.profileId),
    fetch: () =>
      refreshProvider.fetchSnapshot({
        force: false,
        profileId: input.profileId,
      }),
    readMetadata: () =>
      getWidgetRefreshMetadata(input.provider, input.profileId),
    writeMetadata: (value) =>
      setWidgetRefreshMetadata(input.provider, input.profileId, value),
    now: () => Date.now(),
  });
}
