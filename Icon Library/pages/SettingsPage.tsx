import {
  Button,
  List,
  Navigation,
  NavigationStack,
  Section,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
  useState,
} from "scripting";
import { CURRENT_VERSION } from "../changelog";
import {
  GlassCenteredActionRow,
  GlassDivider,
  GlassGroup,
  GlassCopyInfoRow,
  GlassNavRow,
  GlassSectionHeader,
  GlassSelectionRow,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import type {
  IconLibrarySettings,
  RepoProfileStore,
} from "../services/models";
import {
  defaultSettings,
  isLibraryReady,
  isRepoConfigured,
  libraryModeTitle,
  repoAddress,
  subscribeUrl,
} from "../services/settings";
import { AboutPage } from "./AboutPage";
import { RepoSettingsPage } from "./RepoSettingsPage";

type Destination = "repo" | "changelog" | null;
type NewProfileDraft = {
  label: string;
  settings: IconLibrarySettings;
};

export function SettingsPage(props: {
  store: RepoProfileStore;
  settings: IconLibrarySettings;
  onSettingsChange: (
    profileId: string,
    next: IconLibrarySettings,
  ) => void;
  onRenameProfile: (profileId: string, label: string) => void;
  onSelectProfile: (id: string) => void;
  onDeleteProfiles: (profileIds: string[]) => void;
  onCreateProfile: (
    label: string,
    settings: IconLibrarySettings,
    token: string,
  ) => void;
}) {
  const {
    store,
    settings,
    onSettingsChange,
    onRenameProfile,
    onDeleteProfiles,
    onSelectProfile,
    onCreateProfile,
  } = props;
  const dismiss = Navigation.useDismiss();
  const [managing, setManaging] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [destination, setDestination] = useState<Destination>(null);
  const [newProfileDraft, setNewProfileDraft] =
    useState<NewProfileDraft | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const ready = isLibraryReady(settings);
  const subUrl = ready ? subscribeUrl(settings) : "";

  async function copySubscribe() {
    if (!subUrl) {
      return;
    }
    await Pasteboard.setString(subUrl);
    setCopyStatus("已复制到剪贴板");
    setTimeout(() => setCopyStatus(null), 1600);
  }

  function startManaging() {
    setManaging(true);
    setSelectedProfileIds([]);
  }

  function stopManaging() {
    setManaging(false);
    setSelectedProfileIds([]);
  }

  function toggleProfileSelection(profileId: string) {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    );
  }

  async function deleteSelectedProfiles() {
    if (selectedProfileIds.length === 0) {
      return;
    }
    const confirmed = await Dialog.confirm({
      title: `删除所选 ${selectedProfileIds.length} 个仓库？`,
      message:
        "只会移除本机保存的仓库配置和对应令牌，不会删除 GitHub 仓库、图标、JSON 文件或 GitHub Actions。",
      confirmLabel: "删除",
    });
    if (!confirmed) {
      return;
    }
    try {
      onDeleteProfiles(selectedProfileIds);
      stopManaging();
    } catch (error) {
      await Dialog.alert({
        title: "删除失败",
        message: String(error),
      });
    }
  }

  const toolbar = managing ? (
    <Toolbar>
      <ToolbarItem placement="cancellationAction">
        <Button title="取消" action={stopManaging} />
      </ToolbarItem>
      <ToolbarItem placement="topBarTrailing">
        <Button
          title={selectedProfileIds.length ? `删除 ${selectedProfileIds.length}` : "删除"}
          role="destructive"
          disabled={selectedProfileIds.length === 0}
          action={() => {
            void deleteSelectedProfiles();
          }}
        />
      </ToolbarItem>
    </Toolbar>
  ) : (
    <Toolbar>
      <ToolbarItem placement="cancellationAction">
        <Button
          title="返回"
          systemImage="chevron.left"
          labelStyle="iconOnly"
          action={dismiss}
        />
      </ToolbarItem>
      <ToolbarItem placement="topBarTrailing">
        <Button
          title="管理"
          disabled={store.profiles.length === 0}
          action={startManaging}
        />
      </ToolbarItem>
    </Toolbar>
  );

  function addProfileAndOpenSettings() {
    setNewProfileDraft({
      label: "新仓库",
      settings: defaultSettings(),
    });
    setDestination("repo");
  }

  function handleCreateProfile(
    label: string,
    nextSettings: IconLibrarySettings,
    token: string,
  ) {
    onCreateProfile(label, nextSettings, token);
  }

  function finishProfileSave() {
    setDestination(null);
    setNewProfileDraft(null);
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={managing ? "选择仓库" : "设置"}
        {...glassListPageProps()}
        toolbar={toolbar}
        navigationDestination={{
          isPresented: destination != null,
          onChanged: (value: boolean) => {
            if (!value) {
              setDestination(null);
              setNewProfileDraft(null);
            }
          },
          content:
            destination === "repo" ? (
              <RepoSettingsPage
                isNew={newProfileDraft != null}
                profileId={newProfileDraft ? "" : store.activeId ?? ""}
                profileLabel={
                  newProfileDraft?.label ??
                  store.profiles.find((item) => item.id === store.activeId)
                    ?.label ??
                  ""
                }
                settings={newProfileDraft?.settings ?? settings}
                onSettingsChange={onSettingsChange}
                onRenameProfile={onRenameProfile}
                onCreateProfile={
                  newProfileDraft ? handleCreateProfile : undefined
                }
                onSaved={finishProfileSave}
              />
            ) : destination === "changelog" ? (
              <AboutPage />
            ) : (
              <Text>选择项目</Text>
            ),
        }}
      >
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="仓库" />}
        >
          <GlassGroup>
            {store.profiles.map((profile) => {
              const pSettings = profile.settings;
              const pConfigured = isRepoConfigured(pSettings);
              const pReady = isLibraryReady(pSettings);
              const pAddress = pConfigured
                ? repoAddress(pSettings)
                : "";
              const detail = pConfigured
                ? `${pAddress} · ${
                    pReady
                      ? libraryModeTitle(pSettings.mode)
                      : "未选择图标库方式"
                  }`
                : "尚未配置仓库地址";
              const isSelected = managing
                ? selectedProfileIds.includes(profile.id)
                : profile.id === store.activeId;
              return (
                <VStack
                  key={profile.id}
                  spacing={0}
                  frame={{ maxWidth: "infinity" }}
                >
                  <GlassSelectionRow
                    title={profile.label}
                    detail={detail}
                    selected={isSelected}
                    action={() => {
                      if (managing) {
                        toggleProfileSelection(profile.id);
                      } else {
                        onSelectProfile(profile.id);
                        setDestination("repo");
                      }
                    }}
                  />
                  <GlassDivider />
                </VStack>
              );
            })}
            {!managing ? (
              <>
                <GlassCenteredActionRow
                  title="新增仓库"
                  action={addProfileAndOpenSettings}
                />
              </>
            ) : null}
          </GlassGroup>
        </Section>

        {!managing ? (
          <>
            <Section
              listRowBackground={glassRowBackground}
              header={<GlassSectionHeader title="订阅地址" />}
            >
              <GlassGroup>
                {ready && subUrl ? (
                  <GlassCopyInfoRow
                    value={subUrl}
                    note={
                      copyStatus ?? "由当前仓库和索引文件自动生成"
                    }
                    action={copySubscribe}
                  />
                ) : (
                  <Text
                    foregroundStyle="secondaryLabel"
                    padding={{ vertical: true }}
                    frame={{ maxWidth: "infinity" }}
                  >
                    完成仓库与图标库配置后显示
                  </Text>
                )}
              </GlassGroup>
            </Section>

            <Section
              listRowBackground={glassRowBackground}
              header={<GlassSectionHeader title="关于" />}
            >
              <GlassGroup>
                <VStack
                  alignment="leading"
                  spacing={8}
                  padding={{ vertical: true }}
                  frame={{ maxWidth: "infinity" }}
                >
                  <Text font={15} fontWeight="medium">
                    Icon Library
                  </Text>
                  <VStack
                    alignment="leading"
                    spacing={6}
                    frame={{ maxWidth: "infinity" }}
                  >
                    <Text
                      font={14}
                      foregroundStyle="secondaryLabel"
                      fixedSize={{ horizontal: false, vertical: true }}
                    >
                      • 使用 GitHub 公开仓库托管图标，并生成可订阅的索引。
                    </Text>
                    <Text
                      font={14}
                      foregroundStyle="secondaryLabel"
                      fixedSize={{ horizontal: false, vertical: true }}
                    >
                      • 支持创建图标库或连接已有图标目录。
                    </Text>
                    <Text
                      font={14}
                      foregroundStyle="secondaryLabel"
                      fixedSize={{ horizontal: false, vertical: true }}
                    >
                      • 支持从相册、文件、Lobe Icons 和 App Store 导入图标。
                    </Text>
                    <Text
                      font={14}
                      foregroundStyle="secondaryLabel"
                      fixedSize={{ horizontal: false, vertical: true }}
                    >
                      • 支持浏览、重命名、批量删除和导出 PNG。
                    </Text>
                    <Text
                      font={14}
                      foregroundStyle="secondaryLabel"
                      fixedSize={{ horizontal: false, vertical: true }}
                    >
                      • 订阅公开 JSON 仅供只读浏览，不修改对方仓库。
                    </Text>
                  </VStack>
                </VStack>
                <GlassDivider />
                <GlassNavRow
                  title="版本信息"
                  detail={`v${CURRENT_VERSION}`}
                  action={() => setDestination("changelog")}
                />
              </GlassGroup>
            </Section>
          </>
        ) : null}
      </List>
    </NavigationStack>
  );
}
