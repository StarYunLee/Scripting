import {
  Button,
  List,
  Section,
  SecureField,
  Text,
  TextField,
  Toolbar,
  ToolbarItem,
  useEffect,
  useState,
} from "scripting";
import {
  GlassCenteredActionRow,
  GlassDivider,
  GlassGroup,
  GlassLabeledRow,
  GlassNavRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import { formatError, maskPersonalAccessToken } from "../services/errors";
import { createIconLibrary } from "../services/library";
import {
  getProfilePat,
  removeProfilePat,
  setProfilePat,
  validatePublicRepository,
} from "../services/github";
import type { IconLibrarySettings } from "../services/models";
import {
  isRepoConfigured,
  parseGithubRepoAddress,
  repoAddress,
} from "../services/settings";
import { ConnectLibraryPage } from "./ConnectLibraryPage";
import { CreateLibraryPage } from "./CreateLibraryPage";

type Destination = "create" | "connect" | null;

export function RepoSettingsPage(props: {
  isNew?: boolean;
  profileId: string;
  profileLabel: string;
  settings: IconLibrarySettings;
  onSettingsChange: (profileId: string, next: IconLibrarySettings) => void;
  onRenameProfile: (profileId: string, label: string) => void;
  onDeleteProfile?: (profileId: string) => void;
  onCreateProfile?: (
    label: string,
    settings: IconLibrarySettings,
    token: string,
  ) => void;
  onSaved?: () => void;
}) {
  const {
    isNew = false,
    profileId,
    profileLabel,
    settings,
    onSettingsChange,
    onRenameProfile,
    onDeleteProfile,
    onCreateProfile,
    onSaved,
  } = props;
  const configured = isRepoConfigured(settings);
  const [profileName, setProfileName] = useState(profileLabel);
  const [settingsDraft, setSettingsDraft] = useState(settings);
  const [displayNameEdited, setDisplayNameEdited] = useState(
    !isNew && profileLabel.trim() !== settings.repo.trim(),
  );
  const [address, setAddress] = useState(
    configured ? repoAddress(settings) : "",
  );
  const [branch, setBranch] = useState(settings.branch || "main");
  const [tokenDraft, setTokenDraft] = useState("");
  const [editingToken, setEditingToken] = useState(isNew);
  const [clearTokenPending, setClearTokenPending] = useState(false);
  const [savingRepo, setSavingRepo] = useState(false);
  const [deletingRepo, setDeletingRepo] = useState(false);
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [savedTokenMask, setSavedTokenMask] = useState("");
  const [destination, setDestination] = useState<Destination>(null);
  const hasPat = Boolean(savedToken);

  useEffect(() => {
    setProfileName(profileLabel);
    setDisplayNameEdited(
      !isNew && profileLabel.trim() !== settings.repo.trim(),
    );
    setTokenDraft("");
    setEditingToken(isNew);
    setClearTokenPending(false);
  }, [isNew, profileId, profileLabel, settings.repo]);

  useEffect(() => {
    const value = getProfilePat(profileId);
    setSavedToken(value);
    setSavedTokenMask(maskPersonalAccessToken(value));
    setEditingToken(isNew || !value);
  }, [isNew, profileId]);

  useEffect(() => {
    setSettingsDraft(settings);
    setAddress(isRepoConfigured(settings) ? repoAddress(settings) : "");
    setBranch(settings.branch || "main");
  }, [
    settings.owner,
    settings.repo,
    settings.branch,
    settings.iconDir,
    settings.jsonPath,
    settings.mode,
  ]);

  function buildSettingsFromDraft(): IconLibrarySettings | null {
    const parsed = parseGithubRepoAddress(address);
    if (!parsed) {
      return null;
    }

    const nextBranch = branch.trim() || "main";
    const sameRepo =
      settingsDraft.owner === parsed.owner &&
      settingsDraft.repo === parsed.repo &&
      settingsDraft.branch === nextBranch;

    return {
      ...settingsDraft,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: nextBranch,
      // 换仓库时丢掉上一库的目录/JSON/模式，避免连接页残留。
      mode: sameRepo ? settingsDraft.mode : "unconfigured",
      iconDir: sameRepo ? settingsDraft.iconDir : "icon",
      jsonPath: sameRepo ? settingsDraft.jsonPath : "icons.json",
    };
  }

  function handleAddressChanged(value: string) {
    setAddress(value);
    if (displayNameEdited) {
      return;
    }
    const parsed = parseGithubRepoAddress(value);
    if (parsed) {
      setProfileName(parsed.repo);
    } else if (!value.trim()) {
      setProfileName("新仓库");
    }
  }

  function handleBranchChanged(value: string) {
    setBranch(value);
  }

  function handleProfileNameChanged(value: string) {
    setProfileName(value);
    setDisplayNameEdited(true);
  }

  function handleLibraryConfigured(next: IconLibrarySettings) {
    setSettingsDraft(next);
    setAddress(repoAddress(next));
    setBranch(next.branch);
  }

  function tokenForChild(): string | undefined {
    return (
      tokenDraft.trim() ||
      (clearTokenPending ? undefined : savedToken) ||
      undefined
    );
  }

  async function createLibraryForSave(
    next: IconLibrarySettings,
    token: string,
  ): Promise<boolean> {
    const options = {
      context: { profileId, settings: next, token },
      iconDir: next.iconDir,
      jsonPath: next.jsonPath,
    };
    try {
      await createIconLibrary(options);
      return true;
    } catch (error) {
      const message = formatError(error);
      if (!message.includes("已有标准索引")) {
        throw error;
      }
      const confirmed = await Dialog.confirm({
        title: "覆盖标准文件？",
        message,
        confirmLabel: "覆盖",
      });
      if (!confirmed) {
        return false;
      }
      await createIconLibrary({ ...options, overwriteStandard: true });
      return true;
    }
  }

  async function saveAll() {
    const next = buildSettingsFromDraft();
    if (!next) {
      await Dialog.alert({
        title: "仓库地址无效",
        message: "请填写 owner/repo，或完整 GitHub 仓库 URL。",
      });
      return;
    }

    if (next.mode === "unconfigured") {
      await Dialog.alert({
        title: "请选择图标库方式",
        message:
          "先选择「创建图标库」或「连接已有图标库」，再点击右上角「保存」。",
      });
      return;
    }

    const nextLabel = profileName.trim();
    if (!nextLabel) {
      await Dialog.alert({
        title: "显示名称不能为空",
        message: "请填写仓库在 App 内显示的名称。",
      });
      return;
    }

    const token = tokenForChild();
    const tokenChanged = Boolean(tokenDraft.trim()) || clearTokenPending;
    const repoChanged =
      settings.owner !== next.owner ||
      settings.repo !== next.repo ||
      settings.branch !== next.branch;
    const shouldCreateRemote =
      next.mode === "create" &&
      (isNew ||
        settings.mode !== "create" ||
        settings.owner !== next.owner ||
        settings.repo !== next.repo ||
        settings.branch !== next.branch ||
        settings.iconDir !== next.iconDir ||
        settings.jsonPath !== next.jsonPath);

    if (shouldCreateRemote && !token) {
      await Dialog.alert({
        title: "创建图标库需要令牌",
        message:
          "请填写个人访问令牌后再保存。令牌仅在保存校验通过后写入本机 Keychain。",
      });
      return;
    }

    setSavingRepo(true);
    try {
      if (isNew || repoChanged || tokenChanged) {
        await validatePublicRepository(next, token ?? undefined);
      }
      if (shouldCreateRemote) {
        const completed = await createLibraryForSave(next, token as string);
        if (!completed) {
          return;
        }
      }
    } catch (error) {
      await Dialog.alert({
        title: "无法保存",
        message: formatError(error),
      });
      return;
    } finally {
      setSavingRepo(false);
    }

    if (isNew) {
      if (!onCreateProfile) {
        await Dialog.alert({
          title: "无法保存仓库",
          message: "新仓库保存入口不可用，请重新打开页面。",
        });
        return;
      }
      onCreateProfile(nextLabel, next, token ?? "");
      if (token) {
        setSavedToken(token);
        setSavedTokenMask(maskPersonalAccessToken(token));
      }
    } else {
      onSettingsChange(profileId, next);
      if (nextLabel !== profileLabel.trim()) {
        onRenameProfile(profileId, nextLabel);
      }
      if (tokenDraft.trim()) {
        setProfilePat(profileId, tokenDraft.trim());
        setSavedToken(tokenDraft.trim());
        setSavedTokenMask(maskPersonalAccessToken(tokenDraft));
      } else if (clearTokenPending) {
        removeProfilePat(profileId);
        setSavedToken(null);
        setSavedTokenMask("");
      }
    }

    setSettingsDraft(next);
    setProfileName(nextLabel);
    setTokenDraft("");
    setEditingToken(false);
    setClearTokenPending(false);
    setAddress(repoAddress(next));
    onSaved?.();
  }

  function updateTokenDraft(value: string) {
    setTokenDraft(value);
    if (value.trim()) {
      setClearTokenPending(false);
    }
  }

  async function requestClearToken() {
    if (isNew || !hasPat) {
      return;
    }
    const confirmed = await Dialog.confirm({
      title: "清除个人访问令牌",
      message: "清除操作将在点击右上角「保存」后生效。",
      confirmLabel: "标记清除",
    });
    if (!confirmed) {
      return;
    }
    setTokenDraft("");
    setEditingToken(false);
    setClearTokenPending(true);
  }

  async function requestDeleteProfile() {
    if (isNew || !profileId || !onDeleteProfile || deletingRepo) {
      return;
    }
    const confirmed = await Dialog.confirm({
      title: `移除仓库“${profileLabel}”？`,
      message:
        "只会移除本机保存的仓库配置和对应令牌，不会删除 GitHub 仓库、图标、JSON 文件或 GitHub Actions。",
      confirmLabel: "移除",
    });
    if (!confirmed) {
      return;
    }
    setDeletingRepo(true);
    try {
      onDeleteProfile(profileId);
      onSaved?.();
    } catch (error) {
      setDeletingRepo(false);
      await Dialog.alert({
        title: "移除失败",
        message: String(error),
      });
    }
  }

  const draftSettings = buildSettingsFromDraft();
  const draftMode = draftSettings?.mode ?? "unconfigured";
  const libraryConfigSummary =
    draftSettings && draftMode !== "unconfigured"
      ? `${draftSettings.iconDir} · ${draftSettings.jsonPath}`
      : "未配置";

  async function openMode(nextMode: Exclude<Destination, null>) {
    const next = buildSettingsFromDraft();
    if (!next) {
      await Dialog.alert({
        title: "先填写仓库地址",
        message: "请先填写有效的 owner/repo 或 GitHub 仓库 URL。",
      });
      return;
    }
    if (nextMode === "create" && !tokenForChild()) {
      await Dialog.alert({
        title: "创建图标库需要访问令牌",
        message: "请先填写个人访问令牌，再进入创建图标库配置。",
      });
      return;
    }
    setSettingsDraft(next);
    setDestination(nextMode);
  }

  async function changeMode() {
    if (draftMode === "unconfigured") {
      return;
    }
    const nextMode: Exclude<Destination, null> =
      draftMode === "create" ? "connect" : "create";
    const nextTitle = nextMode === "create" ? "创建图标库" : "连接已有图标库";
    const selected = await Dialog.actionSheet({
      title: "更改图标库方式",
      message: `当前类型：${draftMode === "create" ? "创建图标库" : "连接已有图标库"}`,
      actions: [{ label: nextTitle }],
    });
    if (selected === 0) {
      await openMode(nextMode);
    }
  }

  return (
    <List
      navigationTitle="仓库与授权"
      tabBarVisibility="hidden"
      {...glassListPageProps()}
      toolbar={
        <Toolbar>
          <ToolbarItem placement="topBarTrailing">
            <Button
              title={savingRepo ? "保存中…" : "保存"}
              disabled={savingRepo}
              action={() => {
                void saveAll();
              }}
            />
          </ToolbarItem>
        </Toolbar>
      }
      navigationDestination={{
        isPresented: destination != null,
        onChanged: (value: boolean) => {
          if (!value) setDestination(null);
        },
        content:
          destination === "create" ? (
            <CreateLibraryPage
              profileId={profileId}
              settings={draftSettings ?? settingsDraft}
              draftOnly={true}
              onConfigured={handleLibraryConfigured}
            />
          ) : destination === "connect" ? (
            <ConnectLibraryPage
              profileId={profileId}
              settings={draftSettings ?? settingsDraft}
              token={tokenForChild()}
              draftOnly={true}
              onConfigured={handleLibraryConfigured}
            />
          ) : (
            <Text>选择图标库方式</Text>
          ),
      }}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="仓库" />}
      >
        <GlassGroup>
          <TextField
            title="仓库地址"
            prompt="例如 owner/repo"
            value={address}
            onChanged={handleAddressChanged}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
          <GlassDivider />
          <TextField
            title="分支"
            prompt="main"
            value={branch}
            onChanged={handleBranchChanged}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
          <GlassDivider />
          <TextField
            title="显示名称"
            prompt="根据仓库名自动填写，可手动修改"
            value={profileName}
            onChanged={handleProfileNameChanged}
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
            显示名称仅用于 App 内仓库列表。
          </Text>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={
          <GlassSectionHeader title={isNew ? "访问令牌" : "个人访问令牌"} />
        }
      >
        <GlassGroup>
          {isNew ? (
            <>
              <GlassLabeledRow
                title="访问令牌"
                value={tokenDraft.trim() ? "已填写，保存时验证" : "未填写"}
              />
              <GlassDivider />
              <SecureField
                title="输入令牌"
                prompt="粘贴 ghp_ 或 github_pat_ 开头的令牌"
                value={tokenDraft}
                onChanged={updateTokenDraft}
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
              />
            </>
          ) : (
            <>
              <GlassLabeledRow
                title="当前令牌"
                value={
                  clearTokenPending
                    ? "待清除（点击保存生效）"
                    : savedTokenMask || "未配置"
                }
              />
              {!hasPat || editingToken ? (
                <>
                  <GlassDivider />
                  <SecureField
                    title={hasPat ? "新令牌" : "设置令牌"}
                    prompt="粘贴 ghp_ 或 github_pat_ 开头的令牌"
                    value={tokenDraft}
                    onChanged={updateTokenDraft}
                    padding={{ vertical: true }}
                    frame={{ minHeight: 44, maxWidth: "infinity" }}
                  />
                  {tokenDraft.trim() ? (
                    <>
                      <GlassDivider />
                      <GlassLabeledRow
                        title="状态"
                        value={
                          hasPat
                            ? "新令牌已填写，保存时验证"
                            : "已填写，保存时验证"
                        }
                      />
                    </>
                  ) : null}
                  {hasPat ? (
                    <>
                      <GlassDivider />
                      <GlassCenteredActionRow
                        title="取消更换"
                        action={() => {
                          setTokenDraft("");
                          setEditingToken(false);
                        }}
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <GlassDivider />
                  <GlassNavRow
                    title="更换令牌"
                    detail="输入新的 Token"
                    action={() => {
                      setEditingToken(true);
                      setClearTokenPending(false);
                    }}
                  />
                </>
              )}
              {hasPat ? (
                <>
                  <GlassDivider />
                  <GlassCenteredActionRow
                    title={clearTokenPending ? "撤销清除" : "清除令牌"}
                    destructive={!clearTokenPending}
                    action={() => {
                      if (clearTokenPending) {
                        setClearTokenPending(false);
                      } else {
                        void requestClearToken();
                      }
                    }}
                  />
                </>
              ) : null}
            </>
          )}
          <GlassDivider />
          <Text
            font={12}
            foregroundStyle="tertiaryLabel"
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            Fine-grained：选择目标仓库，授予 Contents → Read and write。
            Classic：授予 public_repo。保存时会通过 GitHub 只读接口验证令牌，验证失败不会保存。
          </Text>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="图标库方式" />}
      >
        <GlassGroup>
          {draftMode === "unconfigured" ? (
            <>
              <GlassNavRow
                title="创建图标库"
                detail="新建目录、索引和 workflow"
                action={() => {
                  void openMode("create");
                }}
              />
              <GlassDivider />
              <GlassNavRow
                title="连接已有图标库"
                detail="选择已有目录和 JSON"
                action={() => {
                  void openMode("connect");
                }}
              />
            </>
          ) : (
            <>
              <GlassNavRow
                title={draftMode === "create" ? "创建图标库" : "连接已有图标库"}
                detail={libraryConfigSummary}
                action={() => {
                  void openMode(draftMode);
                }}
              />
              <GlassDivider />
              <GlassCenteredActionRow
                title="更改类型"
                action={() => {
                  void changeMode();
                }}
              />
            </>
          )}
        </GlassGroup>
      </Section>

      {!isNew && onDeleteProfile ? (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="移除" />}
        >
          <GlassGroup>
            <GlassCenteredActionRow
              title={deletingRepo ? "移除中…" : "移除仓库"}
              destructive={true}
              disabled={deletingRepo || savingRepo}
              action={() => {
                void requestDeleteProfile();
              }}
            />
          </GlassGroup>
        </Section>
      ) : null}
    </List>
  );
}
