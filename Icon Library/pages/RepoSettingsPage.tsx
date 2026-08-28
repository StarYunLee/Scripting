import {
  List,
  Section,
  Text,
  TextField,
  useEffect,
  useState,
} from "scripting";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassLabeledRow,
  GlassNavRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import { formatError, maskPersonalAccessToken } from "../services/errors";
import {
  getProfilePat,
  removeProfilePat,
  setProfilePat,
  validatePat,
  validatePublicRepository,
} from "../services/github";
import type { IconLibrarySettings } from "../services/models";
import {
  isRepoConfigured,
  libraryModeTitle,
  parseGithubRepoAddress,
  repoAddress,
} from "../services/settings";
import { ConnectLibraryPage } from "./ConnectLibraryPage";
import { CreateLibraryPage } from "./CreateLibraryPage";

type Destination = "create" | "connect" | null;

export function RepoSettingsPage(props: {
  profileId: string;
  profileLabel: string;
  settings: IconLibrarySettings;
  onSettingsChange: (
    profileId: string,
    next: IconLibrarySettings,
  ) => void;
  onRenameProfile: (profileId: string, label: string) => void;
  onDeleteProfile: (profileId: string) => void;
}) {
  const {
    profileId,
    profileLabel,
    settings,
    onSettingsChange,
    onRenameProfile,
    onDeleteProfile,
  } = props;
  const configured = isRepoConfigured(settings);
  const [profileName, setProfileName] = useState(profileLabel);
  const [address, setAddress] = useState(
    configured ? repoAddress(settings) : "",
  );
  const [branch, setBranch] = useState(settings.branch || "main");
  const [tokenDraft, setTokenDraft] = useState("");
  const [savingRepo, setSavingRepo] = useState(false);
  const [savedTokenMask, setSavedTokenMask] = useState(() =>
    maskPersonalAccessToken(getProfilePat(profileId)),
  );
  const [destination, setDestination] = useState<Destination>(null);
  const hasPat = Boolean(savedTokenMask);

  useEffect(() => {
    setProfileName(profileLabel);
  }, [profileId, profileLabel]);

  useEffect(() => {
    setSavedTokenMask(maskPersonalAccessToken(getProfilePat(profileId)));
  }, [profileId]);

  useEffect(() => {
    setAddress(isRepoConfigured(settings) ? repoAddress(settings) : "");
    setBranch(settings.branch || "main");
  }, [settings.owner, settings.repo, settings.branch]);

  async function saveProfileName() {
    try {
      onRenameProfile(profileId, profileName);
      setProfileName(profileName.trim());
      await Dialog.alert({
        title: "显示名称已保存",
        message: "仅修改仓库列表中的显示名称，不会修改 GitHub 仓库或索引文件。",
      });
    } catch (error) {
      await Dialog.alert({
        title: "无法保存显示名称",
        message: formatError(error),
      });
    }
  }

  async function deleteLocalProfile() {
    const label = profileLabel || profileName.trim() || "当前仓库";
    const confirmed = await Dialog.confirm({
      title: `移除「${label}」？`,
      message:
        "将从本机仓库列表中移除此配置，并清除对应的个人访问令牌。\n\n不会删除 GitHub 仓库、图标、JSON 文件或 GitHub Actions。",
      confirmLabel: "移除",
    });
    if (!confirmed) {
      return;
    }
    try {
      onDeleteProfile(profileId);
    } catch (error) {
      await Dialog.alert({
        title: "删除失败",
        message: formatError(error),
      });
    }
  }

  async function saveRepo() {
    const parsed = parseGithubRepoAddress(address);
    if (!parsed) {
      await Dialog.alert({
        title: "仓库地址无效",
        message: "请填写 owner/repo，或完整 GitHub 仓库 URL。",
      });
      return;
    }

    const sameRepo =
      settings.owner === parsed.owner &&
      settings.repo === parsed.repo &&
      settings.branch === (branch.trim() || "main");

    const next: IconLibrarySettings = {
      ...settings,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: branch.trim() || "main",
      // 换仓库时丢掉上一库的目录/JSON/模式，避免连接页残留。
      mode: sameRepo ? settings.mode : "unconfigured",
      iconDir: sameRepo ? settings.iconDir : "icon",
      jsonPath: sameRepo ? settings.jsonPath : "icons.json",
    };

    setSavingRepo(true);
    try {
      await validatePublicRepository(next);
    } catch (error) {
      await Dialog.alert({
        title: "无法保存仓库",
        message: formatError(error),
      });
      return;
    } finally {
      setSavingRepo(false);
    }

    onSettingsChange(profileId, next);
    setAddress(repoAddress(next));
    await Dialog.alert({
      title: "已保存仓库",
      message: sameRepo
        ? "仓库已更新。可继续创建或连接图标库。"
        : "已切换仓库并清空上一库配置。请重新创建或连接。",
    });
  }

  async function saveToken() {
    const raw = tokenDraft.trim();
    if (!raw) {
      await Dialog.alert({
        title: "请先粘贴令牌",
        message: hasPat
          ? "输入框只用于更换令牌。当前令牌仍保存在 Keychain。"
          : "请先粘贴个人访问令牌，再校验并保存。",
      });
      return;
    }

    const confirmed = await Dialog.confirm({
      title: hasPat ? "更换个人访问令牌" : "保存个人访问令牌",
      message: "令牌会保存在本机 Keychain，仅本应用可读写。",
      confirmLabel: "保存",
    });
    if (!confirmed) {
      return;
    }

    try {
      await validatePat(raw, settings);
    } catch (error) {
      await Dialog.alert({
        title: "令牌无效",
        message: formatError(error),
      });
      return;
    }

    setProfilePat(profileId, raw);
    setSavedTokenMask(maskPersonalAccessToken(raw));
    setTokenDraft("");
    await Dialog.alert({
      title: "令牌有效并已保存",
      message: "之后读写当前仓库将使用这份个人访问令牌。",
    });
  }

  async function clearToken() {
    const confirmed = await Dialog.confirm({
      title: "清除个人访问令牌",
      message: "确定清除当前仓库已保存的个人访问令牌？",
      confirmLabel: "清除",
    });
    if (!confirmed) {
      return;
    }
    removeProfilePat(profileId);
    setSavedTokenMask("");
    setTokenDraft("");
  }

  async function openMode(next: Exclude<Destination, null>) {
    if (!configured) {
      await Dialog.alert({
        title: "先保存仓库",
        message: "填写并保存 GitHub 仓库地址后再选择创建或连接。",
      });
      return;
    }
    setDestination(next);
  }

  return (
    <List
      navigationTitle="仓库与授权"
      {...glassListPageProps()}
      navigationDestination={{
        isPresented: destination != null,
        onChanged: (value: boolean) => {
          if (!value) setDestination(null);
        },
        content:
          destination === "create" ? (
            <CreateLibraryPage
              profileId={profileId}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          ) : destination === "connect" ? (
            <ConnectLibraryPage
              profileId={profileId}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          ) : (
            <Text>选择方式</Text>
          ),
      }}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="列表显示" />}
      >
        <GlassGroup>
          <TextField
            title="显示名称"
            prompt="输入列表显示名称"
            value={profileName}
            onChanged={setProfileName}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
          <GlassDivider />
          <GlassActionRow
            title="保存显示名称"
            action={saveProfileName}
          />
          <GlassDivider />
          <Text
            font={12}
            foregroundStyle="tertiaryLabel"
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            仅用于仓库列表显示，不会修改 GitHub 仓库名、图标目录或 JSON 文件名。
          </Text>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="仓库" />}
      >
        <GlassGroup>
          <TextField
            title="仓库地址"
            prompt="例如 owner/repo"
            value={address}
            onChanged={setAddress}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
          <GlassDivider />
          <TextField
            title="分支"
            prompt="main"
            value={branch}
            onChanged={setBranch}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
          <GlassDivider />
          <GlassActionRow
            title={savingRepo ? "检查公开仓库中…" : "保存仓库"}
            disabled={savingRepo}
            action={saveRepo}
          />
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="图标库" />}
      >
        <GlassGroup>
          <GlassNavRow
            title="创建图标库"
            detail="标准 workflow"
            action={() => {
              void openMode("create");
            }}
          />
          <GlassDivider />
          <GlassNavRow
            title="连接已有图标库"
            detail="只选目录和 JSON"
            action={() => {
              void openMode("connect");
            }}
          />
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="当前配置" />}
      >
        <GlassGroup>
          {configured ? (
            <>
              <GlassLabeledRow title="仓库" value={repoAddress(settings)} />
              <GlassDivider />
              <GlassLabeledRow title="分支" value={settings.branch} />
              <GlassDivider />
              <GlassLabeledRow
                title="方式"
                value={libraryModeTitle(settings.mode)}
              />
              {settings.mode === "unconfigured" ? (
                <>
                  <GlassDivider />
                  <Text
                    foregroundStyle="secondaryLabel"
                    padding={{ vertical: true }}
                    frame={{ maxWidth: "infinity" }}
                  >
                    尚未选择创建或连接，目录和索引未生效
                  </Text>
                </>
              ) : (
                <>
                  <GlassDivider />
                  <GlassLabeledRow title="图标目录" value={settings.iconDir} />
                  <GlassDivider />
                  <GlassLabeledRow title="索引文件" value={settings.jsonPath} />
                </>
              )}
            </>
          ) : (
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
              frame={{ maxWidth: "infinity" }}
            >
              尚未配置仓库
            </Text>
          )}
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="个人访问令牌" />}
      >
        <GlassGroup>
          <GlassLabeledRow
            title="当前令牌"
            value={savedTokenMask || "未保存"}
          />
          <GlassDivider />
          <TextField
            title="新令牌"
            prompt="粘贴 ghP_ 或 github_pat_ 开头的令牌"
            value={tokenDraft}
            onChanged={setTokenDraft}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
          <GlassDivider />
          <GlassActionRow title="校验并保存" action={saveToken} />
          {hasPat ? (
            <>
              <GlassDivider />
              <GlassActionRow
                title="清除已保存的令牌"
                destructive={true}
                action={clearToken}
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
            在 GitHub 创建 Fine-grained 个人访问令牌，仓库权限只需 Contents: Read and write。当前版本仅支持 Public 仓库；令牌保存在本机 Keychain，不会写入仓库或应用源码。
          </Text>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="从仓库列表移除" />}
      >
        <GlassGroup>
          <GlassActionRow
            title="移除此仓库"
            destructive={true}
            action={deleteLocalProfile}
          />
          <GlassDivider />
          <Text
            font={12}
            foregroundStyle="tertiaryLabel"
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            将删除本机保存的仓库配置和对应令牌，不会删除 GitHub 仓库或其中的任何内容。
          </Text>
        </GlassGroup>
      </Section>
    </List>
  );
}
