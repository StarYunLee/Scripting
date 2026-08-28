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
  const [overviewRevision, setOverviewRevision] = useState(0);

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
          overviewRevision={overviewRevision}
          onOverviewChange={() => setOverviewRevision((current) => current + 1)}
        />
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value="settings">
        <SettingsPage
          demoMode={demoMode}
          backgroundTheme={backgroundTheme}
          onDemoModeChange={updateDemoMode}
          onBackgroundThemeChange={updateBackgroundTheme}
          onOverviewChange={() => setOverviewRevision((current) => current + 1)}
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
