import {
  Navigation,
  Script,
  Tab,
  TabView,
  useEffect,
  useObservable,
  useRef,
  useState,
} from "scripting";
import { GalleryPage } from "./pages/GalleryPage";
import { IconsPage } from "./pages/IconsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UploadPage } from "./pages/UploadPage";
import { loadCachedCatalog, loadCatalog } from "./services/catalog";
import { formatError } from "./services/errors";
import type {
  CatalogSnapshot,
  IconLibrarySettings,
  RepoContext,
  RepoProfileStore,
} from "./services/models";
import {
  currentSettings,
  deleteProfile,
  loadProfileStore,
  renameProfile,
  saveProfileSettings,
  selectProfile,
  upsertProfile,
} from "./services/profiles";
import { isLibraryReady } from "./services/settings";

type RootTab = "icons" | "gallery" | "upload" | "settings";

function libraryKey(value: IconLibrarySettings): string {
  return [
    value.owner,
    value.repo,
    value.branch,
    value.iconDir,
    value.jsonPath,
    value.mode,
  ].join("|");
}

function App() {
  const [store, setStore] = useState<RepoProfileStore>(() =>
    loadProfileStore(),
  );
  const selection = useObservable<string>("icons");
  function setRootTab(tab: RootTab) {
    selection.setValue(tab);
  }
  const catalogRequestRef = useRef(0);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = currentSettings(store);
  const profileId = store.activeId;
  const context: RepoContext | null = profileId
    ? { profileId, settings }
    : null;
  const ready = isLibraryReady(settings);

  async function refreshCatalog(target: RepoContext) {
    const { profileId: targetProfileId, settings: targetSettings } = target;
    const targetKey = `${targetProfileId}|${libraryKey(targetSettings)}`;
    const storeAtStart = loadProfileStore();
    const currentKeyAtStart = `${storeAtStart.activeId ?? ""}|${libraryKey(
      currentSettings(storeAtStart),
    )}`;
    if (currentKeyAtStart !== targetKey) {
      return;
    }
    const requestId = ++catalogRequestRef.current;

    function isCurrentRequest(): boolean {
      if (requestId !== catalogRequestRef.current) {
        return false;
      }
      const latestStore = loadProfileStore();
      if (latestStore.activeId !== targetProfileId) {
        return false;
      }
      const latestKey = `${targetProfileId}|${libraryKey(
        currentSettings(latestStore),
      )}`;
      return latestKey === targetKey;
    }

    if (!isLibraryReady(targetSettings)) {
      if (isCurrentRequest()) {
        setCatalog(null);
        setError(null);
      }
      return;
    }

    try {
      const next = await loadCatalog(target);
      if (!isCurrentRequest()) {
        return;
      }
      setCatalog(next);
      setError(null);
    } catch (err) {
      if (!isCurrentRequest()) {
        return;
      }
      const message = formatError(err);
      setError(message);
      throw err;
    }
  }

  useEffect(() => {
    if (!ready) {
      catalogRequestRef.current += 1;
      setCatalog(null);
      setError(null);
      return;
    }

    const cached = loadCachedCatalog(settings);
    setCatalog(cached);
    if (profileId) {
      void refreshCatalog({ profileId, settings }).catch(() => {
        // refreshCatalog 已把当前请求错误写入 state；effect 不再制造未处理 rejection。
      });
    }
  }, [profileId, libraryKey(settings)]);

  function handleSettingsChange(
    targetProfileId: string,
    next: IconLibrarySettings,
  ) {
    setStore(saveProfileSettings(targetProfileId, next));
  }

  function handleRenameProfile(targetProfileId: string, label: string) {
    setStore(renameProfile(targetProfileId, label));
  }

  function handleDeleteProfile(targetProfileId: string) {
    setStore(deleteProfile(targetProfileId));
  }

  function handleSelectProfile(id: string) {
    setStore(selectProfile(id));
  }

  function handleAddProfile() {
    const next = upsertProfile({
      label: "新仓库",
      settings: {
        owner: "",
        repo: "",
        branch: "main",
        iconDir: "icon",
        jsonPath: "icons.json",
        mode: "unconfigured",
      },
    });
    setStore(next);
  }

  return (
    <TabView selection={selection}>
      <Tab title="图标" systemImage="square.grid.2x2.fill" value="icons">
        <IconsPage
          key={`icons-${profileId ?? "none"}`}
          profileId={profileId ?? ""}
          settings={settings}
          catalog={catalog}
          error={error}
          onRefresh={() =>
            context ? refreshCatalog(context) : Promise.resolve()
          }
          onOpenSettings={() => setRootTab("settings")}
        />
      </Tab>
      <Tab title="订阅" systemImage="rectangle.stack" value="gallery">
        <GalleryPage />
      </Tab>
      <Tab title="上传" systemImage="square.and.arrow.up" value="upload">
        <UploadPage
          key={`upload-${profileId ?? "none"}`}
          profileId={profileId ?? ""}
          settings={settings}
          catalog={catalog}
          onUploaded={() =>
            context ? refreshCatalog(context) : Promise.resolve()
          }
          onOpenIcons={() => setRootTab("icons")}
          onOpenSettings={() => setRootTab("settings")}
        />
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value="settings">
        <SettingsPage
          key={`settings-${profileId ?? "none"}`}
          store={store}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onRenameProfile={handleRenameProfile}
          onDeleteProfile={handleDeleteProfile}
          onSelectProfile={handleSelectProfile}
          onAddProfile={handleAddProfile}
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

void run();
