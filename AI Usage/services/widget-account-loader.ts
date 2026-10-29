import { captureAccountWork, captureAccountCredentialWork } from "./account-work-guard";
import { invalidateUsageRuntime } from "./runtime-consistency";
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
  const refreshProvider = getWidgetRefreshProvider(input.provider);
  const currentWork = input.provider === "deepseek"
    ? captureAccountCredentialWork(input.provider, input.profileId,
        () => refreshProvider.token(input.profileId))
    : captureAccountWork(input.provider, input.profileId);
  invalidateUsageRuntime();
  const snapshotProvider = getSnapshotProvider(input.provider);
  return loadWidgetAccountSnapshotWith({
    ...input,
    force: input.provider === "deepseek" && !refreshProvider.token(input.profileId),
  }, {
    readSnapshot: () => snapshotProvider.cache(input.profileId),
    fetch: () =>
      refreshProvider.fetchSnapshot({
        force: false,
        profileId: input.profileId,
      }),
    readMetadata: () =>
      getWidgetRefreshMetadata(input.provider, input.profileId),
    writeMetadata: (value) =>
      currentWork() &&
      setWidgetRefreshMetadata(input.provider, input.profileId, value),
    now: () => Date.now(),
  });
}
