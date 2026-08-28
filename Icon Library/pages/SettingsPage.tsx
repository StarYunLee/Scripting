import {
  List,
  NavigationStack,
  Section,
  Text,
  VStack,
  useState,
} from "scripting";
import { CURRENT_VERSION } from "../changelog";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassInfoRow,
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
  isLibraryReady,
  isRepoConfigured,
  libraryModeTitle,
  repoAddress,
  subscribeUrl,
} from "../services/settings";
import { AboutPage } from "./AboutPage";
import { RepoSettingsPage } from "./RepoSettingsPage";
import { useRootToolbar } from "./rootToolbar";

type Destination = "repo" | "changelog" | null;

export function SettingsPage(props: {
  store: RepoProfileStore;
  settings: IconLibrarySettings;
  onSettingsChange: (
    profileId: string,
    next: IconLibrarySettings,
  ) => void;
  onRenameProfile: (profileId: string, label: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onSelectProfile: (id: string) => void;
  onAddProfile: () => void;
}) {
  const {
    store,
    settings,
    onSettingsChange,
    onRenameProfile,
    onDeleteProfile,
    onSelectProfile,
    onAddProfile,
  } = props;
  const toolbar = useRootToolbar();
  const [destination, setDestination] = useState<Destination>(null);
  const ready = isLibraryReady(settings);
  const subUrl = ready ? subscribeUrl(settings) : "";

  async function copySubscribe() {
    if (!subUrl) {
      await Dialog.alert({
        title: "还没有订阅地址",
        message: "先在「仓库与授权」保存仓库，再创建或连接图标库。",
      });
      return;
    }
    await Pasteboard.setString(subUrl);
    await Dialog.alert({
      title: "已复制",
      message: "订阅地址已复制到剪贴板。当前版本仅支持公开仓库。",
    });
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
        {...glassListPageProps()}
        toolbar={toolbar}
        navigationDestination={{
          isPresented: destination != null,
          onChanged: (value: boolean) => {
            if (!value) setDestination(null);
          },
          content:
            destination === "repo" ? (
              <RepoSettingsPage
                profileId={store.activeId ?? ""}
                profileLabel={
                  store.profiles.find((item) => item.id === store.activeId)
                    ?.label ?? ""
                }
                settings={settings}
                onSettingsChange={onSettingsChange}
                onRenameProfile={onRenameProfile}
                onDeleteProfile={onDeleteProfile}
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
              const isActive = profile.id === store.activeId;
              return (
                <VStack
                  key={profile.id}
                  spacing={0}
                  frame={{ maxWidth: "infinity" }}
                >
                  <GlassSelectionRow
                    title={profile.label}
                    detail={detail}
                    selected={isActive}
                    action={() => onSelectProfile(profile.id)}
                  />
                  <GlassDivider />
                </VStack>
              );
            })}
            <GlassActionRow title="新增仓库" action={onAddProfile} />
            {store.activeId ? (
              <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
                <GlassDivider />
                <GlassNavRow
                  title="仓库与授权"
                  detail="编辑当前仓库"
                  action={() => setDestination("repo")}
                />
              </VStack>
            ) : null}
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="订阅" />}
        >
          <GlassGroup>
            {ready && subUrl ? (
              <>
                <GlassInfoRow
                  title="订阅地址"
                  value={subUrl}
                  note="由当前仓库和索引文件自动生成"
                />
                <GlassDivider />
                <GlassActionRow title="复制订阅地址" action={copySubscribe} />
              </>
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
          header={<GlassSectionHeader title="版本" />}
        >
          <GlassGroup>
            <GlassNavRow
              title="版本信息"
              detail={`v${CURRENT_VERSION}`}
              action={() => setDestination("changelog")}
            />
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
              <Text font={14} foregroundStyle="secondaryLabel">
                用 GitHub 公开仓库托管一套图标，并生成可供订阅的索引。
              </Text>
              <Text font={14} foregroundStyle="secondaryLabel">
                先保存公开仓库和个人访问令牌，再创建新库或连接已有目录。
              </Text>
              <Text font={14} foregroundStyle="secondaryLabel">
                从相册、文件、Lobe Icons 或 App Store 加入图标后提交到仓库；支持浏览、重命名和批量删除。
              </Text>
              <Text font={14} foregroundStyle="secondaryLabel">
                订阅可添加别人的公开 JSON，只读浏览，不写入对方仓库。
              </Text>
            </VStack>
          </GlassGroup>
        </Section>
      </List>
    </NavigationStack>
  );
}
