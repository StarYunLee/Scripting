import {
  Button,
  Divider,
  Image,
  LazyVGrid,
  Menu,
  Navigation,
  NavigationStack,
  ScrollView,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
  useEffect,
  useState,
} from "scripting";
import {
  GlassEmptyStateCard,
} from "../components/Glass";
import { IconGlassTile } from "../components/IconGlassTile";
import { PageBackground } from "../components/PageBackground";
import { formatError } from "../services/errors";
import type {
  CatalogIcon,
  CatalogSnapshot,
  RemoteLibrary,
  RemoteLibraryStore,
} from "../services/models";
import {
  addRemoteLibrary,
  getCurrentRemoteLibrary,
  loadCachedRemoteCatalog,
  loadRemoteLibraryStore,
  refreshRemoteCatalog,
  selectRemoteLibrary,
} from "../services/remoteLibraries";
import { IconDetailPage } from "./IconDetailPage";
import { GalleryManagePage } from "./GalleryManagePage";

const ICON_SIZE = 64;
const GRID_COLUMNS = [
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 12,
    alignment: "top" as const,
  },
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 12,
    alignment: "top" as const,
  },
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 12,
    alignment: "top" as const,
  },
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 12,
    alignment: "top" as const,
  },
];

function filterIcons(icons: CatalogIcon[], query: string): CatalogIcon[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return icons;
  }
  return icons.filter((item) => {
    return (
      item.name.toLowerCase().includes(keyword) ||
      item.filename.toLowerCase().includes(keyword)
    );
  });
}

export function GalleryPage() {
  const dismiss = Navigation.useDismiss();
  const [store, setStore] = useState<RemoteLibraryStore>({
    libraries: [],
    currentId: null,
  });
  const [initialized, setInitialized] = useState(false);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<CatalogIcon | null>(null);
  const [managing, setManaging] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = getCurrentRemoteLibrary(store);
  const icons = catalog ? filterIcons(catalog.icons, query) : [];

  async function loadLibrary(library: RemoteLibrary, force = false) {
    const cached = loadCachedRemoteCatalog(library.id);
    if (cached && !force) {
      setCatalog(cached);
      setError(null);
    }
    try {
      const next = await refreshRemoteCatalog(library);
      setCatalog(next);
      setError(null);
    } catch (err) {
      if (!cached) {
        setCatalog(null);
      }
      setError(formatError(err));
      throw err;
    }
  }

  useEffect(() => {
    if (!initialized) {
      return;
    }
    if (!current) {
      setCatalog(null);
      setError(null);
      return;
    }
    void loadLibrary(current).catch(() => {
      /* error already stored */
    });
  }, [initialized, current?.id]);

  async function handleRefresh() {
    if (!current) {
      return;
    }
    setRefreshNote("正在刷新…");
    try {
      await loadLibrary(current, true);
      setRefreshNote("刷新完成");
    } catch (err) {
      setRefreshNote(`刷新失败：${formatError(err)}`);
      return;
    }
    setTimeout(() => {
      setRefreshNote((note) =>
        note === "刷新完成" || note === "正在刷新…" ? null : note,
      );
    }, 1600);
  }

  async function addLibrary() {
    const raw = await Dialog.prompt({
      title: "添加订阅",
      message: "粘贴公开图标库的 JSON 地址，例如 raw.githubusercontent.com 上的 icons.json。",
      placeholder: "https://raw.githubusercontent.com/owner/repo/main/icons.json",
    });
    if (!raw) {
      return;
    }
    try {
      const added = await addRemoteLibrary({ jsonUrl: raw });
      setStore(added.store);
      setCatalog(added.snapshot);
      setError(null);
      setQuery("");
    } catch (err) {
      await Dialog.alert({
        title: "添加失败",
        message: formatError(err),
      });
    }
  }

  return (
    <NavigationStack>
      <ScrollView
        onAppear={() => {
          if (!initialized) {
            setStore(loadRemoteLibraryStore());
            setInitialized(true);
          }
        }}
        navigationTitle={current?.title ?? "订阅"}
        navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden"
        background={<PageBackground />}
        searchable={
          current
            ? {
                value: query,
                onChanged: setQuery,
                prompt: "搜索订阅图标",
                placement: "navigationBarDrawerAlwaysDisplay",
              }
            : undefined
        }
        refreshable={current ? handleRefresh : undefined}
        toolbar={
          <Toolbar>
            <ToolbarItem placement="cancellationAction">
              <Button
                title="返回"
                systemImage="chevron.left"
                labelStyle="iconOnly"
                action={dismiss}
              />
            </ToolbarItem>
            {store.libraries.length > 0 ? (
              <ToolbarItem placement="primaryAction">
                <Menu title="管理">
                  {store.libraries.map((item) =>
                    item.id === store.currentId ? (
                      <Button
                        key={item.id}
                        title={item.title}
                        systemImage="checkmark"
                        action={() => {}}
                      />
                    ) : (
                      <Button
                        key={item.id}
                        title={item.title}
                        action={() => {
                          try {
                            setStore(selectRemoteLibrary(item.id));
                            setQuery("");
                            setOpened(null);
                          } catch (err) {
                            void Dialog.alert({
                              title: "切换失败",
                              message: formatError(err),
                            });
                          }
                        }}
                      />
                    ),
                  )}
                  <Divider />
                  <Button
                    title="管理订阅"
                    action={() => {
                      setOpened(null);
                      setManaging(true);
                    }}
                  />
                </Menu>
              </ToolbarItem>
            ) : null}
          </Toolbar>
        }
        navigationDestination={
          managing
            ? {
                isPresented: true,
                onChanged: (value: boolean) => {
                  if (!value) {
                    setManaging(false);
                    setStore(loadRemoteLibraryStore());
                  }
                },
                content: (
                  <GalleryManagePage
                    store={store}
                    onStoreChange={setStore}
                  />
                ),
              }
            : {
                isPresented: opened != null,
                onChanged: (value: boolean) => {
                  if (!value) setOpened(null);
                },
                content: opened ? (
                  <IconDetailPage
                    key={opened.url}
                    icon={opened}
                    readOnly={true}
                  />
                ) : (
                  <Text>选择图标</Text>
                ),
              }
        }
      >
        <VStack
          spacing={10}
          padding={{ horizontal: 16, top: 8, bottom: 24 }}
          frame={{ maxWidth: "infinity", alignment: "top" }}
        >
          {refreshNote ? (
            <Text
              font={12}
              foregroundStyle={
                refreshNote.startsWith("刷新失败") ? "systemRed" : "secondaryLabel"
              }
            >
              {refreshNote}
            </Text>
          ) : error && icons.length > 0 ? (
            <Text font={12} foregroundStyle="systemRed">
              {error}
            </Text>
          ) : catalog && icons.length > 0 ? (
            <Text font={12} foregroundStyle="secondaryLabel">
              {`${catalog.icons.length} 个图标`}
            </Text>
          ) : null}

          {!initialized ? (
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: 20 }}
              frame={{ maxWidth: "infinity" }}
            >
              正在载入订阅…
            </Text>
          ) : !current ? (
            <GlassEmptyStateCard
              systemImage="rectangle.stack"
              title="还没有订阅"
              message="添加公开图标库 JSON 后，即可在这里只读浏览图标。"
              actionTitle="添加订阅"
              action={() => {
                void addLibrary();
              }}
            />
          ) : icons.length === 0 ? (
            query.trim() ? (
              <Text
                foregroundStyle="secondaryLabel"
                frame={{ maxWidth: "infinity" }}
                padding={{ vertical: 20 }}
              >
                没有匹配的图标
              </Text>
            ) : error ? (
              <GlassEmptyStateCard
                systemImage="exclamationmark.triangle"
                title="订阅读取失败"
                message={error}
                actionTitle="重新扫描"
                action={handleRefresh}
              />
            ) : catalog ? (
              <GlassEmptyStateCard
                systemImage="rectangle.stack"
                title="这个订阅还没有图标"
                message="可以下拉刷新，或切换其他公开图标库。"
                actionTitle="重新扫描"
                action={handleRefresh}
              />
            ) : (
              <GlassEmptyStateCard
                systemImage="rectangle.stack"
                title="正在读取订阅"
                message="正在从公开 JSON 读取图标目录。"
                actionTitle="重新扫描"
                action={handleRefresh}
              />
            )
          ) : (
            <LazyVGrid
              columns={GRID_COLUMNS}
              spacing={18}
              alignment="center"
              frame={{ maxWidth: "infinity" }}
            >
              {icons.map((icon) => (
                <VStack
                  key={`${icon.filename}-${icon.url}`}
                  spacing={6}
                  alignment="center"
                  frame={{ maxWidth: "infinity", alignment: "top" }}
                  onTapGesture={() => setOpened(icon)}
                >
                  <IconGlassTile>
                    <Image
                      imageUrl={icon.url}
                      resizable={true}
                      scaleToFit={true}
                      frame={{ width: ICON_SIZE, height: ICON_SIZE }}
                      placeholder={<Text>…</Text>}
                    />
                  </IconGlassTile>
                  <Text
                    font={11}
                    lineLimit={2}
                    multilineTextAlignment="center"
                    frame={{ maxWidth: "infinity" }}
                  >
                    {icon.filename}
                  </Text>
                </VStack>
              ))}
            </LazyVGrid>
          )}
        </VStack>
      </ScrollView>
    </NavigationStack>
  );
}
