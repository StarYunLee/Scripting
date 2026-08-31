import { Image, Spacer, Text, VStack, Widget } from "scripting";
import { resolveWidgetParameter } from "./widget/parameter";
import { isDemoAccountId, isDemoMode, listDemoCards } from "./services/demo";
import { WidgetDispatcher } from "./widget/WidgetDispatcher";
import { getEffectiveWidgetWindows } from "./services/widget-prefs";
import { getAppDisplaySettings } from "./services/settings";
import { writeLog } from "./services/logger";
import { loadWidgetAccountSnapshot } from "./services/widget-account-loader";
import { loadDashboardWidgetUsage } from "./widget/dashboard-loader";
import { DashboardWidgetView } from "./widget/dashboard/DashboardWidgetView";
import { widgetFallbackWidth } from "./widget/family";

function ErrorWidget({ message }: { message: string }) {
  return (
    <VStack
      alignment="leading"
      spacing={8}
      padding={16}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground="systemBackground"
    >
      <Image
        systemName="chart.bar.doc.horizontal.fill"
        font={22}
        foregroundStyle="secondaryLabel"
      />
      <Spacer />
      <Text font={15} fontWeight="bold">
        AI Usage
      </Text>
      <Text font={11} foregroundStyle="secondaryLabel" lineLimit={3}>
        {message}
      </Text>
    </VStack>
  );
}

async function run() {
  const family = String(Widget.family || "systemSmall");
  const resolved = resolveWidgetParameter(Widget.parameter);
  const reloadMinutes = getAppDisplaySettings().reloadMinutes;
  // 手动（0）时仍给系统一个较长的建议重建窗口，避免立刻反复唤醒。
  const reloadPolicy = {
    policy: "after" as const,
    date: new Date(
      Date.now() +
        (reloadMinutes > 0 ? reloadMinutes : 24 * 60) * 60 * 1000,
    ),
  };

  if (resolved.mode === "dashboard") {
    try {
      const loaded = await loadDashboardWidgetUsage();
      let width = widgetFallbackWidth(family);
      try {
        const actual = (Widget as { displaySize?: { width?: number } })
          .displaySize?.width;
        if (actual && actual > 40) width = actual;
      } catch {
        /* use Medium fallback */
      }
      Widget.present(
        <DashboardWidgetView
          cards={loaded.cards}
          family={family}
          width={width}
          hasErrors={loaded.hasErrors}
          display={loaded.display}
        />,
        { reloadPolicy },
      );
    } catch (error) {
      writeLog({
        level: "error",
        source: "widget",
        category: "widget",
        event: "widget.dashboard_failed",
        message: "多账号小组件加载失败",
        code: error instanceof Error ? error.name : "unknown",
      });
      Widget.present(
        <ErrorWidget
          message={
            error instanceof Error && error.message
              ? error.message
              : "多账号小组件加载失败"
          }
        />,
        { reloadPolicy },
      );
    }
    return;
  }

  if (!resolved.account) {
    writeLog({
      level: "error",
      source: "widget",
      category: "widget",
      event: "widget.account_invalid",
      message: resolved.error || "小组件账号不可用",
      code: "invalid_parameter",
    });
    Widget.present(<ErrorWidget message={resolved.error || "账号不可用"} />);
    return;
  }

  const { provider, profileId } = resolved.account;

  // 处理演示模式账号
  if (isDemoAccountId(profileId) || isDemoMode()) {
    const demoCard =
      listDemoCards().find(
        (c) => c.provider === provider && c.accountId === profileId,
      ) ||
      listDemoCards().find((c) => c.provider === provider) ||
      listDemoCards()[0];

    if (!demoCard) {
      Widget.present(<ErrorWidget message="演示账号数据不存在" />, {
        reloadPolicy,
      });
      return;
    }

    const effectiveWindows = getEffectiveWidgetWindows(
      demoCard.provider,
      demoCard.accountId,
      demoCard.windows,
    );

    Widget.present(
      <WidgetDispatcher
        provider={demoCard.provider}
        planLabel={demoCard.planLabel}
        windows={effectiveWindows}
        resetCredits={demoCard.resetCredits}
        fetchedAt={demoCard.fetchedAt}
        family={family}
      />,
      { reloadPolicy },
    );
    return;
  }

  // 正常模式：按自动刷新 Planner 决定使用缓存或联网。
  const loaded = await loadWidgetAccountSnapshot({
    provider,
    profileId,
    reloadMinutes,
  });
  const snapshot = loaded.snapshot;
  const allWindows = snapshot?.windows || [];
  if (!snapshot && (loaded.statusText || loaded.errorMessage)) {
    Widget.present(
      <ErrorWidget message={loaded.statusText || loaded.errorMessage!} />,
      {
        reloadPolicy,
      },
    );
    return;
  }
  const effectiveWindows = getEffectiveWidgetWindows(
    provider,
    profileId,
    allWindows,
  );

  Widget.present(
    <WidgetDispatcher
      provider={provider}
      planLabel={snapshot?.planLabel || null}
      windows={effectiveWindows}
      resetCredits={snapshot?.resetCredits || null}
      fetchedAt={snapshot?.fetchedAt || null}
      family={family}
      errorText={loaded.statusText || loaded.errorMessage}
    />,
    { reloadPolicy },
  );
}

void run().catch((error) => {
  writeLog({
    level: "error",
    source: "widget",
    category: "widget",
    event: "widget.render_failed",
    message: "小组件渲染失败",
    code: error instanceof Error ? error.name : "unknown",
  });
  try {
    Widget.present(
      <ErrorWidget message="小组件渲染失败，请打开 AI Usage 查看运行记录" />,
    );
  } catch {
    /* WidgetKit 可能已经销毁当前执行上下文。 */
  }
});
