import {
  Navigation,
  Script,
  Tab,
  TabView,
  useEffect,
  useObservable,
} from "scripting";
import { AllStarsPage } from "./pages/all-stars-page";
import { ListsPage } from "./pages/lists-page";
import { RepositoriesPage } from "./pages/repositories-page";
import { SettingsPage } from "./pages/settings-page";
import { GitHubDataStore } from "./services/data-store";

const store = new GitHubDataStore();

type RootTab = "stars" | "lists" | "repositories" | "settings";

function App() {
  const selection = useObservable<string>(() =>
    store.getState().tokenConfigured ? "stars" : "settings",
  );

  function setRootTab(tab: RootTab) {
    selection.setValue(tab);
  }

  useEffect(() => {
    // 启动时优先使用本地缓存瞬间呈现；仅在无缓存或后台静默同步
    void store.syncOnLaunch();
  }, []);

  return (
    <TabView selection={selection}>
      <Tab title="Stars" systemImage="star.fill" value="stars">
        <AllStarsPage
          store={store}
          onOpenSettings={() => setRootTab("settings")}
        />
      </Tab>
      <Tab title="列表" systemImage="folder.fill" value="lists">
        <ListsPage
          store={store}
          onOpenSettings={() => setRootTab("settings")}
        />
      </Tab>
      <Tab title="仓库" systemImage="shippingbox.fill" value="repositories">
        <RepositoriesPage
          store={store}
          onOpenSettings={() => setRootTab("settings")}
        />
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
