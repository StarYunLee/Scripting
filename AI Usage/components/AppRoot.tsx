import { invalidateUsageRuntime } from "../services/runtime-consistency";
import { invalidateDashboardWidgetPreferences } from "../services/dashboard-widget-prefs";
import {
  AppEvents,
  type ScenePhase,
  Script,
  Tab,
  TabView,
  useEffect,
  useState,
} from "scripting";
import { SettingsPage } from "../pages/SettingsPage";
import { StatusPage } from "../pages/StatusPage";
import { isDemoMode, setDemoMode } from "../services/demo";
import { ensureAllMigrations } from "../services/hub";
import {
  getAppDisplaySettings,
  setAppBackgroundTheme,
  type BackgroundThemeId,
} from "../services/settings";
import type { AppHost } from "../models";

export function AppRoot(props: { host?: AppHost; onDismiss?: () => void }) {
  const host = props.host ?? "index";
  const [demoMode, setDemoModeState] = useState(() => isDemoMode());
  const [backgroundTheme, setBackgroundThemeState] =
    useState<BackgroundThemeId>(() => getAppDisplaySettings().backgroundTheme);
  const [overviewRevision, setOverviewRevision] = useState(0);

  // 迁移不挡首帧：各 provider 读取/写入路径（store.ensure）会惰性补齐，
  // 顶层只保证旧版本升级后尽早跑完未触达的 provider。
  useEffect(() => {
    ensureAllMigrations();
  }, []);

  function syncLocalState() {
    invalidateUsageRuntime();
    invalidateDashboardWidgetPreferences();
    setDemoModeState(isDemoMode());
    setBackgroundThemeState(getAppDisplaySettings().backgroundTheme);
    setOverviewRevision((value) => value + 1);
  }

  useEffect(() => {
    let wasBackground = false;
    const listener = (phase: ScenePhase) => {
      if (phase === "background") wasBackground = true;
      if (phase !== "active" || !wasBackground) return;
      wasBackground = false;
      syncLocalState();
    };
    AppEvents.scenePhase.addListener(listener);
    return () => AppEvents.scenePhase.removeListener(listener);
  }, []);

  useEffect(() => {
    if (host !== "home_screen") return;
    const anyScript = Script as unknown as {
      onHomeTabEvent?: (
        handler: (event: "selected" | "reselected" | "deselected") => void,
      ) => () => void;
    };
    if (typeof anyScript.onHomeTabEvent !== "function") return;

    const off = anyScript.onHomeTabEvent((event) => {
      if (event === "selected" || event === "reselected") {
        syncLocalState();
      }
    });

    return () => {
      if (typeof off === "function") off();
    };
  }, [host]);

  async function updateDemoMode(enabled: boolean) {
    if (!setDemoMode(enabled)) {
      await Dialog.alert({
        title: "设置未保存",
        message: "无法保存演示模式，请稍后重试。",
        buttonLabel: "关闭",
      });
      return;
    }
    setDemoModeState(enabled);
  }

  async function updateBackgroundTheme(theme: BackgroundThemeId) {
    const result = setAppBackgroundTheme(theme);
    if (!result.ok) {
      await Dialog.alert({
        title: "设置未保存",
        message: "无法保存背景主题，请稍后重试。",
        buttonLabel: "关闭",
      });
      return;
    }
    setBackgroundThemeState(theme);
  }

  // Home 模式：无内部 TabView，避免与 Scripting 底栏冲突，用量页右上角齿轮直接导航进设置
  if (host === "home_screen") {
    return (
      <StatusPage
        host={host}
        demoMode={demoMode}
        backgroundTheme={backgroundTheme}
        overviewRevision={overviewRevision}
        onDemoModeChange={updateDemoMode}
        onBackgroundThemeChange={updateBackgroundTheme}
        onOverviewChange={() => setOverviewRevision((current) => current + 1)}
        onBackupRestored={() => {
          setBackgroundThemeState(getAppDisplaySettings().backgroundTheme);
          setOverviewRevision((current) => current + 1);
        }}
      />
    );
  }

  return (
    <TabView>
      <Tab title="用量" systemImage="chart.bar.fill" value="status">
        <StatusPage
          host={host}
          demoMode={demoMode}
          backgroundTheme={backgroundTheme}
          overviewRevision={overviewRevision}
          onDismiss={props.onDismiss}
          onOverviewChange={() => setOverviewRevision((current) => current + 1)}
        />
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value="settings">
        <SettingsPage
          host={host}
          demoMode={demoMode}
          backgroundTheme={backgroundTheme}
          onDismiss={props.onDismiss}
          onDemoModeChange={updateDemoMode}
          onBackgroundThemeChange={updateBackgroundTheme}
          onOverviewChange={() => setOverviewRevision((current) => current + 1)}
          onBackupRestored={() => {
            setBackgroundThemeState(getAppDisplaySettings().backgroundTheme);
            setOverviewRevision((current) => current + 1);
          }}
        />
      </Tab>
    </TabView>
  );
}
