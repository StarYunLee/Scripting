import { Image, Spacer, Text, VStack, Widget } from "scripting";
import { resolveWidgetAccount } from "./widget/parameter";
import { loadWidgetUsage } from "./widget/loader";
import { UsageWidgetView as CodexUsageWidgetView } from "./widget/codex/UsageWidgetView";
import { UsageWidgetView as GrokUsageWidgetView } from "./widget/grok/UsageWidgetView";
import { UsageWidgetView as ClaudeUsageWidgetView } from "./widget/claude/UsageWidgetView";
import { UsageWidgetView as AntigravityUsageWidgetView } from "./widget/antigravity/UsageWidgetView";
import { UsageWidgetView as CursorUsageWidgetView } from "./widget/cursor/UsageWidgetView";
import { UsageWidgetView as KimiUsageWidgetView } from "./widget/kimi/UsageWidgetView";
import { getAppDisplaySettings } from "./services/settings";
import { writeLog } from "./services/logger";

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
  const resolved = resolveWidgetAccount(Widget.parameter);
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
  const reloadMinutes = getAppDisplaySettings().reloadMinutes;
  const reloadPolicy = {
    policy: "after" as const,
    date: new Date(Date.now() + reloadMinutes * 60 * 1000),
  };
  const loaded = await loadWidgetUsage(provider, profileId);

  if (loaded.provider === "codex") {
    Widget.present(
      <CodexUsageWidgetView
        result={loaded.result}
        family={family}
        focusWindow={loaded.settings.focusWindow}
        widgetLayout={loaded.settings.widgetLayout}
      />,
      { reloadPolicy },
    );
    return;
  }

  if (loaded.provider === "grok") {
    Widget.present(
      <GrokUsageWidgetView result={loaded.result} family={family} />,
      { reloadPolicy },
    );
    return;
  }

  if (loaded.provider === "claude") {
    Widget.present(
      <ClaudeUsageWidgetView
        result={loaded.result}
        family={family}
        focusWindow={loaded.settings.focusWindow}
        widgetStyle={loaded.settings.widgetStyle}
        dualQuotaPreset={loaded.settings.dualQuotaPreset}
      />,
      { reloadPolicy },
    );
    return;
  }

  if (loaded.provider === "cursor") {
    Widget.present(
      <CursorUsageWidgetView result={loaded.result} family={family} />,
      { reloadPolicy },
    );
    return;
  }

  if (loaded.provider === "kimi") {
    Widget.present(
      <KimiUsageWidgetView result={loaded.result} family={family} />,
      { reloadPolicy },
    );
    return;
  }

  Widget.present(
    <AntigravityUsageWidgetView
      result={loaded.result}
      family={family}
      focusWindow={loaded.settings.focusWindow}
      widgetStyle={loaded.settings.widgetStyle}
      dualQuotaPreset={loaded.settings.dualQuotaPreset}
    />,
    { reloadPolicy },
  );
}

void run();
