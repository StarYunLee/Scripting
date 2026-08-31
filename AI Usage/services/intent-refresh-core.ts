import type { ProviderId } from "../models";
import type { RefreshSummary } from "./refresh";

export type IntentRefreshScope =
  { kind: "all" } | { kind: "provider"; provider: ProviderId };

type IntentRefreshLog = {
  level: "info" | "warning" | "error";
  source: "intent";
  category: "refresh";
  event: string;
  provider?: ProviderId;
  message: string;
  code?: string;
};

export type IntentRefreshDependencies = {
  refreshAll(): Promise<RefreshSummary>;
  refreshProvider(provider: ProviderId): Promise<RefreshSummary>;
  requestWidgetReload(): boolean;
  writeLog(input: IntentRefreshLog): void;
};

export function createIntentRefreshRunner(
  dependencies: IntentRefreshDependencies,
) {
  return async function runIntentRefresh(
    scope: IntentRefreshScope,
  ): Promise<RefreshSummary> {
    try {
      const summary =
        scope.kind === "all"
          ? await dependencies.refreshAll()
          : await dependencies.refreshProvider(scope.provider);
      dependencies.requestWidgetReload();
      dependencies.writeLog({
        level: summary.failed ? "warning" : "info",
        source: "intent",
        category: "refresh",
        event:
          scope.kind === "all"
            ? "intent.refresh_all.completed"
            : "intent.refresh.completed",
        provider: scope.kind === "provider" ? scope.provider : undefined,
        message:
          scope.kind === "all"
            ? `全部刷新完成：成功 ${summary.succeeded}，失败 ${summary.failed}`
            : `Intent 刷新完成：成功 ${summary.succeeded}，失败 ${summary.failed}`,
      });
      return summary;
    } catch (error) {
      dependencies.writeLog({
        level: "error",
        source: "intent",
        category: "refresh",
        event:
          scope.kind === "all"
            ? "intent.refresh_all.failed"
            : "intent.refresh.failed",
        provider: scope.kind === "provider" ? scope.provider : undefined,
        message: scope.kind === "all" ? "全部刷新失败" : "Intent 刷新失败",
        code: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
  };
}
