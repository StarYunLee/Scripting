import {
  Navigation,
  Script,
  Tab,
  TabView,
  useEffect,
  useState,
} from "scripting";
import { AllStarsPage } from "./pages/all-stars-page";
import { ListsPage } from "./pages/lists-page";
import { SettingsPage } from "./pages/settings-page";
import { GitHubDataStore } from "./services/data-store";

const store = new GitHubDataStore();

function App() {
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    // 启动时优先使用本地缓存瞬间呈现；仅在无缓存或后台静默同步
    void store.syncOnLaunch();
  }, []);

  return (
    <TabView tabIndex={tabIndex} onTabIndexChanged={setTabIndex}>
      <Tab title="Stars" systemImage="star.fill" value="stars">
        <AllStarsPage store={store} />
      </Tab>
      <Tab title="列表" systemImage="folder.fill" value="lists">
        <ListsPage store={store} />
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value="settings">
        <SettingsPage store={store} />
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

void run();
