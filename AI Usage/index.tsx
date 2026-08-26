import { Navigation, Script, Tab, TabView, useState } from "scripting";
import { SettingsPage } from "./pages/SettingsPage";
import { StatusPage } from "./pages/StatusPage";
import { isDemoMode, setDemoMode } from "./services/demo";
import { ensureAllMigrations } from "./services/hub";
import {
  getAppDisplaySettings,
  setAppBackgroundTheme,
  type BackgroundThemeId,
} from "./services/settings";

ensureAllMigrations();

function App() {
  const [demoMode, setDemoModeState] = useState(() => isDemoMode());
  const [backgroundTheme, setBackgroundThemeState] =
    useState<BackgroundThemeId>(() => getAppDisplaySettings().backgroundTheme);
  const [dashboardEpoch, setDashboardEpoch] = useState(0);

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
