import {
  HStack,
  Image,
  List,
  NavigationStack,
  Section,
  Text,
  TextField,
  Toggle,
  VStack,
  useEffect,
  useState,
} from "scripting";
import { CURRENT_VERSION } from "../changelog";
import { ChangelogPage } from "./changelog-page";
import { ContributionGraph } from "../ui/contribution-graph";
import { TopLanguagesBar } from "../ui/top-languages-bar";
import {
  hasToken,
  removeToken,
  saveToken,
  storedTokenMask,
} from "../auth/token";
import type { AppState } from "../types";
import type { GitHubDataStore } from "../services/data-store";
import { displayError } from "../services/errors";
import { EmptyState } from "../ui/common";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassLabeledRow,
  GlassNavRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../ui/glass";
import { glassListPageProps } from "../ui/glass-list-page";
import { useRootToolbar } from "./root-toolbar";

export function SettingsPage(props: { store: GitHubDataStore }) {
  const { store } = props;
  const [state, setState] = useState<AppState>(() => store.getState());
  const [busy, setBusy] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [savedTokenMask, setSavedTokenMask] = useState(() => storedTokenMask());
  const [showChangelog, setShowChangelog] = useState(false);
  const rootToolbar = useRootToolbar();
  useEffect(() => store.subscribe("settings", setState), []);
  async function configureToken() {
    const raw = tokenDraft.trim();
    if (!raw) {
      await Dialog.alert({
        title: "请先粘贴令牌",
        message: hasToken()
          ? "输入框只用于更换令牌。当前令牌仍保存在 Keychain。"
          : "请先粘贴 Classic PAT，再校验并保存。",
      });
      return;
    }
    const confirmed = await Dialog.confirm({
      title: hasToken() ? "更换个人访问令牌" : "保存个人访问令牌",
      message: state.includePrivateRepositories
        ? "需要 Personal access token (classic) 的 user 与 repo 权限。repo 用于私有仓库访问，也覆盖公开仓库管理和 Star 写入。令牌只保存在本机 Keychain。"
        : "需要 Personal access token (classic) 的 user 与 public_repo 权限。public_repo 用于公开仓库管理和 Star 写入，令牌只保存在本机 Keychain。",
      cancelLabel: "取消",
      confirmLabel: "保存并验证",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      saveToken(raw);
      setSavedTokenMask(storedTokenMask());
      setTokenDraft("");
      store.refreshTokenState(true);
      await store.refreshAll(true);
      if (state.includePrivateRepositories) {
        await store.refreshOwnedRepositories();
      }
      await Dialog.alert({
        title: "令牌有效并已保存",
        message: state.includePrivateRepositories
          ? "之后将使用这份 Classic PAT 管理 Stars、Lists，以及本人公开和私有仓库。"
          : "之后将使用这份 Classic PAT 管理 Stars、Lists 和本人公开仓库。",
      });
    } catch (error) {
      await Dialog.alert({
        title: "令牌无效或权限不足",
        message:
          displayError(store.getState().viewerError) ??
          displayError(store.getState().starsError) ??
          displayError(store.getState().listsError) ??
          (typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : String(error)),
      });
    } finally {
      setBusy(false);
    }
  }
  async function togglePrivateRepositories(enabled: boolean) {
    if (!enabled) {
      setBusy(true);
      try {
        await store.setIncludePrivateRepositories(false);
      } finally {
        setBusy(false);
      }
      return;
    }
    const confirmed = await Dialog.confirm({
      title: "显示私有仓库",
      message:
        "此功能需要 Personal access token (classic) 的 repo 权限。repo 是高权限授权；应用只读取和缓存本机仓库元数据，不读取源码、Issues、Actions 或 Secrets。请先确认当前令牌已勾选 repo。",
      cancelLabel: "取消",
      confirmLabel: "确认开启",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await store.setIncludePrivateRepositories(true);
    } catch (error) {
      await Dialog.alert({
        title: "无法加载私有仓库",
        message:
          "请确认 Classic PAT 已勾选 repo 权限后重试。" +
          (typeof error === "object" && error !== null && "message" in error
            ? `\n\n${String(error.message)}`
            : ""),
      });
    } finally {
      setBusy(false);
    }
  }

  async function clearToken() {
    const confirmed = await Dialog.confirm({
      title: "移除 Token",
      message: "移除后将无法刷新 GitHub 数据。",
      cancelLabel: "取消",
      confirmLabel: "移除",
    });
    if (!confirmed) return;
    removeToken();
    setSavedTokenMask("");
    setTokenDraft("");
    store.refreshTokenState();
    store.clearLocalData();
  }
  const user = state.viewer;
  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
        {...glassListPageProps()}
        toolbar={rootToolbar}
        navigationDestination={{
          isPresented: showChangelog,
          onChanged: (value: boolean) => {
            if (!value) setShowChangelog(false);
          },
          content: showChangelog ? <ChangelogPage /> : <Text>版本信息</Text>,
        }}
      >
        <Section
          header={<GlassSectionHeader title="账户" />}
          listRowBackground={glassRowBackground}
        >
          <GlassGroup>
            {user ? (
              <VStack
                alignment="center"
                spacing={14}
                padding={{ vertical: true }}
                frame={{ maxWidth: "infinity", alignment: "center" }}
              >
                {user.avatarUrl ? (
                  <Image
                    imageUrl={user.avatarUrl}
                    resizable
                    aspectRatio={{ value: 1, contentMode: "fill" }}
                    frame={{ width: 68, height: 68 }}
                    clipShape="circle"
                  />
                ) : (
                  <Image
                    systemName="person.crop.circle"
                    frame={{ width: 68, height: 68 }}
                  />
                )}
                <HStack spacing={8} alignment="center">
                  <Text font="headline">{user.name || user.login}</Text>
                  <Text foregroundStyle="secondaryLabel">{`@${user.login}`}</Text>
                </HStack>
                {user.bio ? (
                  <Text
                    foregroundStyle="secondaryLabel"
                    lineLimit={2}
                    frame={{ maxWidth: "infinity", alignment: "center" }}
                    multilineTextAlignment="center"
                  >
                    {user.bio}
                  </Text>
                ) : null}
                {user.location || user.company || user.websiteUrl ? (
                  <HStack
                    spacing={12}
                    alignment="center"
                    frame={{ maxWidth: "infinity", alignment: "center" }}
                  >
                    {user.location ? (
                      <HStack spacing={3} alignment="center">
                        <Image
                          systemName="mappin.and.ellipse"
                          font="caption2"
                          foregroundStyle="secondaryLabel"
                        />
                        <Text font="caption2" foregroundStyle="secondaryLabel">
                          {user.location}
                        </Text>
                      </HStack>
                    ) : null}
                    {user.company ? (
                      <HStack spacing={3} alignment="center">
                        <Image
                          systemName="building.2"
                          font="caption2"
                          foregroundStyle="secondaryLabel"
                        />
                        <Text font="caption2" foregroundStyle="secondaryLabel">
                          {user.company}
                        </Text>
                      </HStack>
                    ) : null}
                    {user.websiteUrl ? (
                      <HStack spacing={3} alignment="center">
                        <Image
                          systemName="link"
                          font="caption2"
                          foregroundStyle="secondaryLabel"
                        />
                        <Text
                          font="caption2"
                          foregroundStyle="secondaryLabel"
                          lineLimit={1}
                        >
                          {user.websiteUrl.replace(/^https?:\/\//, "")}
                        </Text>
                      </HStack>
                    ) : null}
                  </HStack>
                ) : null}
                <GlassDivider />
                {/* 4 列资产与社交统计：纯英文统一风格 */}
                <HStack spacing={0} frame={{ maxWidth: "infinity" }}>
                  <VStack
                    spacing={1}
                    frame={{ maxWidth: "infinity", alignment: "center" }}
                  >
                    <Text font="title3">
                      {user.starredRepositoriesCount ?? state.stars.length}
                    </Text>
                    <Text font="caption" foregroundStyle="secondaryLabel">
                      Stars
                    </Text>
                  </VStack>
                  <VStack
                    spacing={1}
                    frame={{ maxWidth: "infinity", alignment: "center" }}
                  >
                    <Text font="title3">
                      {user.listsCount ?? state.lists.length}
                    </Text>
                    <Text font="caption" foregroundStyle="secondaryLabel">
                      Lists
                    </Text>
                  </VStack>
                  <VStack
                    spacing={1}
                    frame={{ maxWidth: "infinity", alignment: "center" }}
                  >
                    <Text font="title3">{user.followersCount ?? 0}</Text>
                    <Text font="caption" foregroundStyle="secondaryLabel">
                      Followers
                    </Text>
                  </VStack>
                  <VStack
                    spacing={1}
                    frame={{ maxWidth: "infinity", alignment: "center" }}
                  >
                    <Text font="title3">{user.followingCount ?? 0}</Text>
                    <Text font="caption" foregroundStyle="secondaryLabel">
                      Following
                    </Text>
                  </VStack>
                </HStack>
                {user.contributionsByYear || user.contributionYears?.length ? (
                  <>
                    <GlassDivider />
                    <ContributionGraph user={user} store={store} />
                  </>
                ) : null}
                {user.topLanguages && user.topLanguages.length > 0 ? (
                  <>
                    <GlassDivider />
                    <TopLanguagesBar languages={user.topLanguages} />
                  </>
                ) : null}
              </VStack>
            ) : (
              <EmptyState
                title="未连接 GitHub"
                detail="配置 Token 后加载账户信息"
              />
            )}
          </GlassGroup>
        </Section>
        <Section
          header={<GlassSectionHeader title="仓库" />}
          listRowBackground={glassRowBackground}
        >
          <GlassGroup>
            <Toggle
              value={state.includePrivateRepositories}
              title="显示私有仓库"
              systemImage="lock.fill"
              disabled={busy}
              onChanged={(enabled: boolean) => {
                void togglePrivateRepositories(enabled);
              }}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            />
            <GlassDivider />
            <Text
              font={12}
              foregroundStyle="tertiaryLabel"
              padding={{ vertical: true }}
              frame={{ maxWidth: "infinity" }}
            >
              默认只加载公开仓库。开启需要 Classic PAT 的 repo 权限；私有仓库
              仅缓存名称、描述、Topics、语言、默认分支与状态等元数据。关闭后会
              立即从内存和本机缓存移除私有仓库元数据。
            </Text>
          </GlassGroup>
        </Section>
        <Section
          header={<GlassSectionHeader title="Token 管理" />}
          listRowBackground={glassRowBackground}
        >
          <GlassGroup>
            <GlassLabeledRow
              title="当前令牌"
              value={savedTokenMask || "未保存"}
            />
            <GlassDivider />
            <TextField
              title="新令牌"
              prompt="粘贴 Classic PAT"
              value={tokenDraft}
              onChanged={setTokenDraft}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            />
            <GlassDivider />
            <GlassActionRow
              title={busy ? "验证中…" : "校验并保存"}
              disabled={busy}
              action={() => {
                void configureToken();
              }}
            />
            {hasToken() ? (
              <>
                <GlassDivider />
                <GlassActionRow
                  title="清除已保存的令牌"
                  destructive
                  action={() => {
                    void clearToken();
                  }}
                />
              </>
            ) : null}
            <GlassDivider />
            <Text
              font={12}
              foregroundStyle="tertiaryLabel"
              padding={{ vertical: true }}
              frame={{ maxWidth: "infinity" }}
            >
              在 GitHub 创建 Personal access token (classic)，勾选 user 与
              public_repo，用于公开仓库管理和 Star 写入。若开启显示私有仓库，
              请改用带 repo 权限的 Classic PAT；repo 也覆盖公开仓库权限。
              令牌保存在本机 Keychain，不会写入仓库、缓存或应用源码。
            </Text>
            {state.viewerError ? (
              <>
                <GlassDivider />
                <Text
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                  foregroundStyle="systemRed"
                >
                  {displayError(state.viewerError)}
                </Text>
              </>
            ) : null}
          </GlassGroup>
        </Section>
        <Section
          header={<GlassSectionHeader title="数据" />}
          listRowBackground={glassRowBackground}
        >
          <GlassGroup>
            <GlassActionRow
              title="刷新全部数据"
              action={() => {
                void store.refreshAll(true);
              }}
            />
            {state.lastSyncedAt ? (
              <>
                <GlassDivider />
                <GlassLabeledRow
                  title="上次同步"
                  value={new Date(state.lastSyncedAt).toLocaleString()}
                />
              </>
            ) : null}
          </GlassGroup>
        </Section>
        <Section
          header={<GlassSectionHeader title="版本" />}
          listRowBackground={glassRowBackground}
        >
          <GlassGroup>
            <GlassNavRow
              title="版本信息"
              detail={`v${CURRENT_VERSION}`}
              detailFont="system"
              action={() => setShowChangelog(true)}
            />
          </GlassGroup>
        </Section>
      </List>
    </NavigationStack>
  );
}
