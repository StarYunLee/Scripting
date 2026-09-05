import { List, Navigation, Picker, Section, Text, useEffect, useState } from "scripting";
import {
  GlassCenteredActionRow,
  GlassDivider,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import { formatError } from "../services/errors";
import {
  connectIconLibrary,
  listDirCandidates,
  listJsonCandidates,
} from "../services/library";
import type {
  IconLibrarySettings,
  RepoContext,
  RepoEntry,
} from "../services/models";

export function ConnectLibraryPage(props: {
  profileId: string;
  settings: IconLibrarySettings;
  onSettingsChange?: (
    profileId: string,
    next: IconLibrarySettings,
  ) => void;
  draftOnly?: boolean;
  token?: string;
  onConfigured?: (next: IconLibrarySettings) => void;
}) {
  const {
    profileId,
    settings,
    onSettingsChange,
    draftOnly = false,
    token,
    onConfigured,
  } = props;
  const context: RepoContext = { profileId, settings, token };
  const [dirs, setDirs] = useState<RepoEntry[]>([]);
  const [jsons, setJsons] = useState<RepoEntry[]>([]);
  const [iconDir, setIconDir] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dismiss = Navigation.useDismiss();
  const repoKey = `${settings.owner}/${settings.repo}@${settings.branch}`;

  async function loadCandidates(activeContext: RepoContext) {
    setLoading(true);
    setError(null);
    setDirs([]);
    setJsons([]);
    setIconDir("");
    setJsonPath("");
    try {
      const [nextDirs, nextJsons] = await Promise.all([
        listDirCandidates(activeContext),
        listJsonCandidates(activeContext),
      ]);
      setDirs(nextDirs);
      setJsons(nextJsons);
      setIconDir(nextDirs[0]?.path ?? "");
      setJsonPath(nextJsons[0]?.path ?? "");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCandidates(context);
  }, [repoKey]);

  async function connect() {
    if (!iconDir || !jsonPath) {
      await Dialog.alert({
        title: "无法连接",
        message: !dirs.length
          ? "这个仓库根目录下没有可用文件夹。"
          : "这个仓库里没有找到 JSON 文件。",
      });
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const next = await connectIconLibrary({
        context,
        iconDir,
        jsonPath,
      });
      if (draftOnly) {
        onConfigured?.(next);
        dismiss();
      } else if (onSettingsChange) {
        onSettingsChange(profileId, next);
        await Dialog.alert({
          title: "已连接",
          message: `目录 ${next.iconDir}/，索引 ${next.jsonPath}。App 不会改这份 JSON 或仓库里的 workflow。`,
        });
      } else {
        await Dialog.alert({
          title: "无法连接",
          message: "保存入口不可用，请重新打开页面。",
        });
        return;
      }
    } catch (err) {
      await Dialog.alert({
        title: "连接失败",
        message: formatError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  const statusText = loading
    ? `正在读取 ${repoKey} …`
    : error
      ? error
      : `${repoKey}：${dirs.length} 个目录，${jsons.length} 个 JSON`;

  return (
    <List
      navigationTitle="连接已有图标库"
      tabBarVisibility="hidden"
      {...glassListPageProps()}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="选择目录和索引" />}
      >
        <GlassGroup>
          {dirs.length === 0 ? (
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
              frame={{ maxWidth: "infinity" }}
            >
              {loading ? "读取目录中…" : "没有可用目录"}
            </Text>
          ) : (
            <Picker
              title="图标目录"
              value={iconDir}
              onChanged={setIconDir}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              {dirs.map((item) => (
                <Text key={item.path} tag={item.path}>
                  {item.path}
                </Text>
              ))}
            </Picker>
          )}
          <GlassDivider />
          {jsons.length === 0 ? (
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
              frame={{ maxWidth: "infinity" }}
            >
              {loading ? "读取 JSON 中…" : "没有找到 JSON 文件"}
            </Text>
          ) : (
            <Picker
              title="索引文件"
              value={jsonPath}
              onChanged={setJsonPath}
              pickerStyle="menu"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              {jsons.map((item) => (
                <Text key={item.path} tag={item.path}>
                  {item.path}
                </Text>
              ))}
            </Picker>
          )}
          <GlassDivider />
          <Text
            font={12}
            foregroundStyle="tertiaryLabel"
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            {statusText}
          </Text>
        </GlassGroup>
      </Section>
      <Section listRowBackground={glassRowBackground}>
        <GlassGroup>
          <GlassCenteredActionRow
            title={loading ? "读取中…" : "重新扫描仓库"}
            disabled={loading}
            action={() => {
              void loadCandidates(context);
            }}
          />
          <GlassDivider />
          <GlassCenteredActionRow
            title={busy ? "处理中…" : draftOnly ? "完成" : "连接"}
            disabled={busy || loading || !iconDir || !jsonPath}
            action={() => {
              void connect();
            }}
          />
          {draftOnly ? (
            <>
              <GlassDivider />
              <Text
                font={12}
                foregroundStyle="tertiaryLabel"
                padding={{ vertical: true }}
                frame={{ maxWidth: "infinity" }}
              >
                这里只修改草稿，返回后由右上角「保存」提交整个仓库配置。
              </Text>
            </>
          ) : null}
        </GlassGroup>
      </Section>
    </List>
  );
}
