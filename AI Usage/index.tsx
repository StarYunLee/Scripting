import { Navigation, Script, Tab, TabView, useEffect, useState } from "scripting";
import { SettingsPage } from "./pages/SettingsPage";
import { StatusPage } from "./pages/StatusPage";
import { isDemoMode, setDemoMode } from "./services/demo-flags";
import { ensureAllMigrations } from "./services/hub";
import {
  getAppDisplaySettings,
  setAppBackgroundTheme,
  type BackgroundThemeId,
} from "./services/settings";

function App() {
  const [demoMode, setDemoModeState] = useState(() => isDemoMode());
  const [backgroundTheme, setBackgroundThemeState] =
    useState<BackgroundThemeId>(() => getAppDisplaySettings().backgroundTheme);
  const [dashboardEpoch, setDashboardEpoch] = useState(0);

  // 迁移不挡首帧：9 家 provider 的读取路径（getAccountRegistry）各自
  // 惰性触发 ensure，顶层只保证旧版本升级后尽早补齐字段。
  useEffect(() => {
    ensureAllMigrations();
  }, []);

  function updateDemoMode(enabled: boolean) {
    setDemoMode(enabled);
    setDemoModeState(enabled);
  }

  function updateBackgroundTheme(theme: BackgroundThemeId) {
    setAppBackgroundTheme(theme);
    setBackgroundThemeState(theme);
  }

  return (
    <TabView>
      <Tab title="用量" systemImage="chart.bar.fill" value="status">
        <StatusPage
          demoMode={demoMode}
          backgroundTheme={backgroundTheme}
          dashboardEpoch={dashboardEpoch}
        />
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value="settings">
        <SettingsPage
          demoMode={demoMode}
          backgroundTheme={backgroundTheme}
          onDemoModeChange={updateDemoMode}
          onBackgroundThemeChange={updateBackgroundTheme}
          onDashboardPrefsChange={() =>
            setDashboardEpoch((value) => value + 1)
          }
        />
      </Tab>
    </TabView>
  );
}

async function run() {
  await Navigation.present({
    element: <App />,
    modalPresentationStyle: "fullScreen",
  });
  Script.exit();
}

run();
