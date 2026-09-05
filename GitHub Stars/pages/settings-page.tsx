import {
  HStack,
  Image,
  List,
  NavigationStack,
  Section,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting";
import { CURRENT_VERSION } from "../changelog";
import { ChangelogPage } from "./changelog-page";
import { ContributionGraph } from "../ui/contribution-graph";
import { TopLanguagesBar } from "../ui/top-languages-bar";
import {
  removeToken,
  saveToken,
  storedTokenMask,
  tokenMask,
} from "../auth/token";
import type { AppState } from "../types";
import type { GitHubDataStore } from "../services/data-store";
import type { TokenValidationResult } from "../services/github-rest";
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
import { GitHubConnectionPage } from "./github-connection-page";
import { useRootToolbar } from "./root-toolbar";

function permissionSummary(
  scopes: readonly string[] | null,
  includePrivateRepositories: boolean,
): string {
  return includePrivateRepositories || scopes?.includes("repo")
    ? "user · repo"
    : "user · public_repo";
}

export function SettingsPage(props: { store: GitHubDataStore }) {
  const { store } = props;
  const [state, setState] = useState<AppState>(() => store.getState());
  const [busy, setBusy] = useState(false);
  const [privateRepositoriesEnabled, setPrivateRepositoriesEnabled] = useState(
    () => state.includePrivateRepositories,
  );
  const [maskedToken, setMaskedToken] = useState("");
  const [destination, setDestination] = useState<
    "connection" | "changelog" | null
  >(null);
  const [tokenScopes, setTokenScopes] = useState<string[] | null>(null);
  const rootToolbar = useRootToolbar();
  useEffect(() => store.subscribe("settings", setState), []);
  useEffect(() => {
    setPrivateRepositoriesEnabled(state.includePrivateRepositories);
  }, [state.includePrivateRepositories]);
  useEffect(() => {
    setMaskedToken(storedTokenMask());
  }, []);
  async function handleTokenVerified(
    token: string,
    result: TokenValidationResult,
  ): Promise<void> {
    saveToken(token);
    setMaskedToken(tokenMask(token));
    setTokenScopes(result.oauthScopes);
    store.refreshTokenState(true);
    void (async () => {
      try {
        await store.refreshAll(true);
        if (store.getState().includePrivateRepositories) {
          await store.refreshOwnedRepositories();
        }
      } catch {
        // 认证已成功；数据刷新错误由设置页和对应数据页自行展示。
      }
    })();
  }
  async function togglePrivateRepositories(enabled: boolean) {
    const previous = state.includePrivateRepositories;
    // Toggle 会先乐观切换原生控件；确认取消时必须显式回写旧值。
    setPrivateRepositoriesEnabled(enabled);
    if (!state.tokenConfigured) {
      store.setIncludePrivateRepositoriesPreference(enabled);
      return;
    }
    if (!enabled) {
      setBusy(true);
      try {
        await store.setIncludePrivateRepositories(false);
      } finally {
        setPrivateRepositoriesEnabled(
          store.getState().includePrivateRepositories,
        );
        setBusy(false);
      }
      return;
    }
    const confirmed = await Dialog.confirm({
      title: "显示私有仓库",
      message:
        "需要 Classic PAT 的 repo 权限。应用仅读取私有仓库元数据，不读取源码、Issues、Actions 或 Secrets。",
      cancelLabel: "取消",
      confirmLabel: "确认开启",
    });
    if (!confirmed) {
      setPrivateRepositoriesEnabled(previous);
      return;
    }
    setBusy(true);
    try {
      await store.setIncludePrivateRepositories(true);
    } catch (error) {
      setPrivateRepositoriesEnabled(
        store.getState().includePrivateRepositories,
      );
      await Dialog.alert({
        title: "无法加载私有仓库",
        message:
          "请确认 Classic PAT 已勾选 repo 权限后重试。" +
          (typeof error === "object" && error !== null && "message" in error
            ? `\n\n${String(error.message)}`
            : ""),
      });
    } finally {
      setPrivateRepositoriesEnabled(
        store.getState().includePrivateRepositories,
      );
      setBusy(false);
    }
  }

  async function disconnectGithub() {
    const confirmed = await Dialog.confirm({
      title: "断开 GitHub",
      message:
        "已保存的访问令牌将从本机删除。\n之后需要重新连接才能访问 GitHub 数据。",
      cancelLabel: "取消",
      confirmLabel: "断开连接",
    });
    if (!confirmed) return;
    removeToken();
    setMaskedToken("");
    setTokenScopes(null);
    setDestination(null);
    store.refreshTokenState(true);
    store.clearLocalData();
  }
  const user = state.viewer;
  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
        {...glassListPageProps()}
        safeAreaPadding={{ bottom: 84 }}
        toolbar={rootToolbar}
        navigationDestination={{
          isPresented: destination != null,
          onChanged: (value: boolean) => {
            if (!value) setDestination(null);
          },
          content:
            destination === "connection" ? (
              <GitHubConnectionPage
                connected={state.tokenConfigured}
                permissionSummary={permissionSummary(
                  tokenScopes,
                  state.includePrivateRepositories,
                )}
                credentialTitle={
                  maskedToken ||
                  (state.tokenConfigured ? "已配置访问令牌" : "未配置访问令牌")
                }
                credentialDetail={
                  state.tokenConfigured ? "已验证 · 本机 Keychain" : undefined
                }
                credentialActionTitle={state.tokenConfigured ? "更换" : "配置"}
                credentialIconActive={state.tokenConfigured}
                privateRepositoriesEnabled={privateRepositoriesEnabled}
                busy={busy}
                onTogglePrivateRepositories={(enabled: boolean) => {
                  void togglePrivateRepositories(enabled);
                }}
                onTokenVerified={handleTokenVerified}
                onDisconnect={disconnectGithub}
              />
            ) : destination === "changelog" ? (
              <ChangelogPage />
            ) : (
              <Text>选择页面</Text>
            ),
        }}
      >
        <Section
          header={<GlassSectionHeader title="GitHub" />}
          listRowBackground={glassRowBackground}
        >
          <GlassGroup>
            {state.tokenConfigured ? (
              <>
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
                            <Text
                              font="caption2"
                              foregroundStyle="secondaryLabel"
                            >
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
                            <Text
                              font="caption2"
                              foregroundStyle="secondaryLabel"
                            >
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
                    {user.contributionsByYear ||
                    user.contributionYears?.length ? (
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
                    title={
                      state.viewerState === "loading"
                        ? "正在加载 GitHub"
                        : "无法加载 GitHub 账户"
                    }
                    detail={displayError(state.viewerError) ?? "请稍后刷新数据"}
                  />
                )}
                <GlassDivider />
                <GlassNavRow
                  title="账户与权限"
                  action={() => setDestination("connection")}
                />
              </>
            ) : (
              <>
                <VStack
                  alignment="center"
                  spacing={14}
                  padding={{ vertical: true }}
                  frame={{ maxWidth: "infinity", alignment: "center" }}
                >
                  <Image
                    systemName="person.crop.circle"
                    font={68}
                    frame={{ width: 68, height: 68 }}
                  />
                  <Text font="headline">未配置访问令牌</Text>
                  <Text foregroundStyle="secondaryLabel">
                    需要配置 GitHub 访问令牌
                  </Text>
                </VStack>
                <GlassDivider />
                <GlassNavRow
                  title="账户与权限"
                  action={() => setDestination("connection")}
                />
              </>
            )}
          </GlassGroup>
        </Section>

        {state.tokenConfigured ? (
          <Section
            header={<GlassSectionHeader title="数据" />}
            listRowBackground={glassRowBackground}
          >
            <GlassGroup>
              <GlassActionRow
                title="刷新全部数据"
                systemImage="arrow.clockwise"
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
        ) : null}
        <Section
          header={<GlassSectionHeader title="版本" />}
          listRowBackground={glassRowBackground}
        >
          <GlassGroup>
            <GlassNavRow
              title="版本信息"
              detail={`v${CURRENT_VERSION}`}
              detailFont="system"
              systemImage="info.circle.fill"
              action={() => setDestination("changelog")}
            />
          </GlassGroup>
        </Section>
      </List>
    </NavigationStack>
  );
}
