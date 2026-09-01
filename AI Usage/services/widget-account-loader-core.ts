import type { ProviderId } from "../models";
import type { WidgetRefreshResult } from "../providers/usage-registry";
import type { NormalizedUsageSnapshot } from "./usage-model";
import { nextWidgetRefreshFailure } from "./widget-refresh-state";
import type { WidgetRefreshMetadata } from "./widget-refresh-metadata";
import {
  planWidgetAutomaticRefresh,
  resolveWidgetReloadPolicy,
  widgetRefreshStatusText,
  type WidgetRefreshPlan,
  type WidgetReloadPolicy,
} from "./widget-refresh-planner";

export type LoadedWidgetSnapshot = {
  snapshot: NormalizedUsageSnapshot | null;
  plan: WidgetRefreshPlan;
  metadata: WidgetRefreshMetadata;
  reloadPolicy: WidgetReloadPolicy;
  statusText?: string;
  errorMessage?: string;
};

export type WidgetAccountLoaderDependencies = {
  readSnapshot(): NormalizedUsageSnapshot | null;
  fetch(): Promise<WidgetRefreshResult>;
  readMetadata(): WidgetRefreshMetadata;
  writeMetadata(value: WidgetRefreshMetadata): boolean;
  now(): number;
};

function iso(now: number): string {
  return new Date(now).toISOString();
}

export async function loadWidgetAccountSnapshotWith(
  input: {
    provider: ProviderId;
    profileId: string;
    reloadMinutes: number;
  },
  dependencies: WidgetAccountLoaderDependencies,
): Promise<LoadedWidgetSnapshot> {
  const now = dependencies.now();
  let snapshot = dependencies.readSnapshot();
  let metadata = dependencies.readMetadata();
  const plan = planWidgetAutomaticRefresh({
    fetchedAt: snapshot?.fetchedAt || null,
    reloadMinutes: input.reloadMinutes,
    metadata,
    now,
  });
  let errorMessage: string | undefined;

  if (plan.action === "fetch") {
    const attemptAt = iso(now);
    metadata = {
      ...metadata,
      lastAttemptAt: attemptAt,
      nextAutomaticAttemptAt: new Date(now + 60_000).toISOString(),
    };
    dependencies.writeMetadata(metadata);
    try {
      const result = await dependencies.fetch();
      if (result.ok) {
        snapshot = result.snapshot;
        const successAt = snapshot?.fetchedAt || iso(dependencies.now());
        metadata = {
          version: 1,
          lastAttemptAt: attemptAt,
          lastSuccessAt: successAt,
          lastFailureAt: null,
          failureCount: 0,
          nextAutomaticAttemptAt: null,
          lastErrorCode: null,
          lastHttpStatus: null,
        };
      } else {
        errorMessage = result.error.message;
        metadata = nextWidgetRefreshFailure(
          metadata,
          result.error,
          iso(dependencies.now()),
        );
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      metadata = nextWidgetRefreshFailure(
        metadata,
        { code: "network_error", message: errorMessage },
        iso(dependencies.now()),
      );
    }
    dependencies.writeMetadata(metadata);
  }

  const finalNow = dependencies.now();
  return {
    snapshot,
    plan,
    metadata,
    reloadPolicy: resolveWidgetReloadPolicy({
      snapshot,
      metadata,
      reloadMinutes: input.reloadMinutes,
      now: finalNow,
    }),
    statusText: widgetRefreshStatusText({
      fetchedAt: snapshot?.fetchedAt || null,
      metadata,
      now: finalNow,
    }),
    errorMessage,
  };
}
