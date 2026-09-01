import {
  Navigation,
  Script,
  Tab,
  TabView,
  useEffect,
  useState,
} from "scripting";
import { SettingsPage } from "./pages/SettingsPage";
import { StatusPage } from "./pages/StatusPage";
import { isDemoMode, setDemoMode } from "./services/demo";
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
  const [overviewRevision, setOverviewRevision] = useState(0);

  // 迁移不挡首帧：各 provider 读取/写入路径（store.ensure）会惰性补齐，
  // 顶层只保证旧版本升级后尽早跑完未触达的 provider。
  useEffect(() => {
    ensureAllMigrations();
  }, []);

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
