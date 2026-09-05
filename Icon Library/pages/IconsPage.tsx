import {
  Button,
  Image,
  LazyVGrid,
  Navigation,
  NavigationStack,
  ScrollView,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
  ZStack,
  useState,
} from "scripting";
import { IconGlassTile } from "../components/IconGlassTile";
import {
  GlassEmptyStateCard,
  GlassEmptyStateContainer,
} from "../components/Glass";
import { PageBackground } from "../components/PageBackground";
import { countPendingIcons } from "../services/catalog";
import { formatError } from "../services/errors";
import { deleteIcons } from "../services/icons";
import type {
  CatalogIcon,
  CatalogSnapshot,
  IconLibrarySettings,
  RepoContext,
} from "../services/models";
import { isLibraryReady, isRepoConfigured } from "../services/settings";
import { IconDetailPage } from "./IconDetailPage";
import { handleMissingProfilePat } from "./patGuide";
import { useRootToolbar } from "./rootToolbar";

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

export function IconsPage(props: {
  profileId: string;
  settings: IconLibrarySettings;
  catalog: CatalogSnapshot | null;
  error: string | null;
  onRefresh: () => Promise<void>;
  onOpenSettings: () => void;
  onOpenUpload: () => void;
}) {
  const {
    profileId,
    settings,
    catalog,
    error,
    onRefresh,
    onOpenSettings,
    onOpenUpload,
  } = props;
  const context: RepoContext = { profileId, settings };
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<CatalogIcon | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const rootToolbar = useRootToolbar();
  const dismiss = Navigation.useDismiss();
  const configured = isLibraryReady(settings);
  const hasRepository = isRepoConfigured(settings);
  const icons = catalog ? filterIcons(catalog.icons, query) : [];
  const pendingCount = countPendingIcons(catalog);

  function toggleSelected(filename: string) {
    setSelected((current) =>
      current.includes(filename)
        ? current.filter((item) => item !== filename)
        : [...current, filename],
    );
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected([]);
  }

  async function handleRefresh() {
    setRefreshNote("正在刷新…");
    try {
      await onRefresh();
      setRefreshNote("刷新完成");
    } catch (err) {
      setRefreshNote(`刷新失败：${formatError(err)}`);
      return;
    }
    setTimeout(() => {
      setRefreshNote((current) =>
        current === "刷新完成" || current === "正在刷新…" ? null : current,
      );
    }, 1600);
  }

  async function deleteSelected() {
    if (selected.length === 0 || busy) {
      return;
    }
    const confirmed = await Dialog.confirm({
      title: "删除所选图标",
      message: `确定删除 ${selected.length} 个文件？删除后无法从本 App 恢复。`,
      confirmLabel: "删除",
    });
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteIcons({
        context,
        filenames: selected,
      });
      await Dialog.alert({
        title: "已删除",
        message: `已从仓库移除 ${selected.length} 个文件。`,
      });
      exitSelecting();
      await onRefresh();
    } catch (err) {
      if (await handleMissingProfilePat(err, onOpenSettings)) {
        return;
      }
      await Dialog.alert({
        title: "删除失败",
        message: formatError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  const toolbar = selecting ? (
    <Toolbar>
      <ToolbarItem placement="cancellationAction">
        <Button title="取消" action={exitSelecting} />
      </ToolbarItem>
      <ToolbarItem placement="primaryAction">
        <Button
          title={busy ? "删除中…" : `删除${selected.length ? ` ${selected.length}` : ""}`}
          role="destructive"
          disabled={busy || selected.length === 0}
          action={() => {
            void deleteSelected();
          }}
        />
      </ToolbarItem>
    </Toolbar>
  ) : configured && icons.length > 0 ? (
    <Toolbar>
      <ToolbarItem placement="cancellationAction">
        <Button
          title="返回"
          systemImage="chevron.left"
          labelStyle="iconOnly"
          action={dismiss}
        />
      </ToolbarItem>
      <ToolbarItem placement="primaryAction">
        <Button
          title="选择"
          action={() => {
            setSelecting(true);
            setSelected([]);
          }}
        />
      </ToolbarItem>
    </Toolbar>
  ) : (
    rootToolbar
  );

  return (
    <NavigationStack>
      <ScrollView
        navigationTitle={selecting ? `已选 ${selected.length}` : "图标"}
        navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden"
        background={<PageBackground />}
        searchable={
          configured
            ? {
                value: query,
                onChanged: setQuery,
                prompt: "请输入图标名称",
                placement: "navigationBarDrawerAlwaysDisplay",
              }
            : undefined
        }
        refreshable={configured && !selecting ? handleRefresh : undefined}
        toolbar={toolbar}
        navigationDestination={{
          isPresented: opened != null && !selecting,
          onChanged: (value: boolean) => {
            if (!value) setOpened(null);
          },
          content: opened ? (
            <IconDetailPage
              key={opened.filename}
              profileId={profileId}
              icon={opened}
              settings={settings}
              onChanged={onRefresh}
              onOpenSettings={onOpenSettings}
            />
          ) : (
            <Text>选择图标</Text>
          ),
        }}
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
          {pendingCount > 0 ? (
            <Text font={12} foregroundStyle="secondaryLabel">
              {`${pendingCount} 个待同步：已上传，等待 Actions 更新索引`}
            </Text>
          ) : null}
          {icons.length === 0 ? (
            !hasRepository ? (
              <GlassEmptyStateContainer>
                <GlassEmptyStateCard
                  systemImage="square.grid.2x2"
                  title="还没有图标库"
                  message="添加一个公开 GitHub 仓库并选择图标库类型，即可开始管理图标。"
                  actionTitle="去设置"
                  action={onOpenSettings}
                />
              </GlassEmptyStateContainer>
            ) : !configured ? (
              <GlassEmptyStateContainer>
                <GlassEmptyStateCard
                  systemImage="square.grid.2x2"
                  title="还未配置图标库"
                  message="仓库已保存，请在设置中选择创建图标库或连接已有图标库。"
                  actionTitle="去设置"
                  action={onOpenSettings}
                />
              </GlassEmptyStateContainer>
            ) : query.trim() ? (
              <Text
                foregroundStyle="secondaryLabel"
                frame={{ maxWidth: "infinity" }}
                padding={{ vertical: 20 }}
              >
                没有匹配的图标
              </Text>
            ) : error ? (
              <GlassEmptyStateContainer>
                <GlassEmptyStateCard
                  systemImage="exclamationmark.triangle"
                  title="图标读取失败"
                  message={error}
                  actionTitle="重新扫描"
                  action={handleRefresh}
                />
              </GlassEmptyStateContainer>
            ) : catalog ? (
              <GlassEmptyStateContainer>
                <GlassEmptyStateCard
                  systemImage="square.grid.2x2"
                  title="图标库还是空的"
                  message="从相册、文件、Lobe Icons 或 App Store 添加图标。"
                  actionTitle="去上传图标"
                  action={onOpenUpload}
                />
              </GlassEmptyStateContainer>
            ) : (
              <GlassEmptyStateContainer>
                <GlassEmptyStateCard
                  systemImage="square.grid.2x2"
                  title="正在读取图标"
                  message="正在从公开仓库读取图标目录。"
                  actionTitle="重新扫描"
                  action={handleRefresh}
                />
              </GlassEmptyStateContainer>
            )
          ) : (
            <LazyVGrid
              columns={GRID_COLUMNS}
              spacing={18}
              alignment="center"
              frame={{ maxWidth: "infinity" }}
            >
              {icons.map((icon) => {
                const isSelected = selected.includes(icon.filename);
                return (
                  <VStack
                    key={icon.filename}
                    spacing={6}
                    alignment="center"
                    frame={{ maxWidth: "infinity", alignment: "top" }}
                    onTapGesture={() => {
                      if (selecting) {
                        toggleSelected(icon.filename);
                        return;
                      }
                      setOpened(icon);
                    }}
                  >
                    <IconGlassTile>
                      <ZStack
                        alignment="topTrailing"
                        frame={{ width: ICON_SIZE, height: ICON_SIZE }}
                      >
                        <Image
                          imageUrl={icon.url}
                          resizable={true}
                          scaleToFit={true}
                          frame={{ width: ICON_SIZE, height: ICON_SIZE }}
                          opacity={selecting && isSelected ? 0.55 : 1}
                          placeholder={<Text>…</Text>}
                        />
                        {selecting ? (
                          <Image
                            systemName={
                              isSelected ? "checkmark.circle.fill" : "circle"
                            }
                            foregroundStyle={
                              isSelected ? "accentColor" : "tertiaryLabel"
                            }
                            offset={{ x: 6, y: -6 }}
                          />
                        ) : icon.pending ? (
                          <Text
                            font={16}
                            fontWeight="bold"
                            foregroundStyle="systemOrange"
                            offset={{ x: 4, y: -6 }}
                          >
                            •
                          </Text>
                        ) : null}
                      </ZStack>
                    </IconGlassTile>
                    <Text
                      font={11}
                      lineLimit={2}
                      multilineTextAlignment="center"
                      frame={{ maxWidth: "infinity" }}
                      foregroundStyle={
                        icon.pending ? "secondaryLabel" : "label"
                      }
                    >
                      {icon.filename}
                    </Text>
                  </VStack>
                );
              })}
            </LazyVGrid>
          )}
        </VStack>
      </ScrollView>
    </NavigationStack>
  );
}
