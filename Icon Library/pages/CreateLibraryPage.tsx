import { List, Section, Text, TextField, useState } from "scripting";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassNavRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import { formatError } from "../services/errors";
import { createIconLibrary } from "../services/library";
import type {
  IconLibrarySettings,
  RepoContext,
} from "../services/models";
import {
  STANDARD_WORKFLOW_PATH,
  STANDARD_WORKFLOW_SCRIPT_PATH,
  sanitizeRepoPathSegment,
} from "../services/settings";
import {
  buildGenerateIconsScript,
  buildGenerateIconsWorkflow,
} from "../services/workflowTemplate";
import { WorkflowPreviewPage } from "./WorkflowPreviewPage";

const DEFAULT_ICON_DIR = "icon";
const DEFAULT_JSON_PATH = "icons.json";

type PreviewKind = "workflow" | "script" | null;

export function CreateLibraryPage(props: {
  profileId: string;
  settings: IconLibrarySettings;
  onSettingsChange: (
    profileId: string,
    next: IconLibrarySettings,
  ) => void;
}) {
  const {
    profileId,
    settings,
    onSettingsChange,
  } = props;
  const context: RepoContext = { profileId, settings };
  const [iconDir, setIconDir] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewKind>(null);

  const resolved: IconLibrarySettings = {
    ...settings,
    iconDir: sanitizeRepoPathSegment(iconDir, DEFAULT_ICON_DIR),
    jsonPath: sanitizeRepoPathSegment(jsonPath, DEFAULT_JSON_PATH),
  };
  const workflowText = buildGenerateIconsWorkflow(resolved);
  const scriptText = buildGenerateIconsScript(resolved);

  async function create(overwriteStandard = false) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await createIconLibrary({
        context,
        iconDir: resolved.iconDir,
        jsonPath: resolved.jsonPath,
        overwriteStandard,
      });
      onSettingsChange(profileId, next);
      await Dialog.alert({
        title: "已创建图标库",
        message: `目录 ${next.iconDir}/，索引 ${next.jsonPath}。已写入标准 workflow，之后由 GitHub Actions 更新索引。`,
      });
    } catch (error) {
      const message = formatError(error);
      if (message.includes("已有标准索引") && !overwriteStandard) {
        const confirmed = await Dialog.confirm({
          title: "覆盖标准文件？",
          message,
          confirmLabel: "覆盖",
        });
        if (confirmed) {
          setBusy(false);
          await create(true);
          return;
        }
      } else {
        await Dialog.alert({
          title: "创建失败",
          message,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <List
      navigationTitle="创建图标库"
      {...glassListPageProps()}
      navigationDestination={{
        isPresented: preview != null,
        onChanged: (value: boolean) => {
          if (!value) setPreview(null);
        },
        content:
          preview === "workflow" ? (
            <WorkflowPreviewPage
              title="Workflow"
              path={STANDARD_WORKFLOW_PATH}
              content={workflowText}
            />
          ) : preview === "script" ? (
            <WorkflowPreviewPage
              title="生成脚本"
              path={STANDARD_WORKFLOW_SCRIPT_PATH}
              content={scriptText}
            />
          ) : (
            <Text>查看模板</Text>
          ),
      }}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="目录与索引" />}
      >
        <GlassGroup>
          <TextField
            title="图标目录"
            prompt={DEFAULT_ICON_DIR}
            value={iconDir}
            onChanged={setIconDir}
            padding={{ vertical: true }}
            frame={{ minHeight: 44, maxWidth: "infinity" }}
          />
          <GlassDivider />
          <TextField
            title="索引文件"
            prompt={DEFAULT_JSON_PATH}
            value={jsonPath}
            onChanged={setJsonPath}
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
            {`将写入 ${settings.owner}/${settings.repo}。不填则用灰色占位的默认名。`}
          </Text>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="标准 Workflow" />}
      >
        <GlassGroup>
          <GlassNavRow
            title="查看 workflow"
            detail="yml"
            action={() => setPreview("workflow")}
          />
          <GlassDivider />
          <GlassNavRow
            title="查看生成脚本"
            detail="py"
            action={() => setPreview("script")}
          />
          <GlassDivider />
          <Text
            font={12}
            foregroundStyle="tertiaryLabel"
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            {`只读预览，内容已按当前目录「${resolved.iconDir}」和索引「${resolved.jsonPath}」生成。创建时写入仓库，不能在这里改。`}
          </Text>
        </GlassGroup>
      </Section>

      <Section listRowBackground={glassRowBackground}>
        <GlassGroup>
          <GlassActionRow
            title={busy ? "创建中…" : "创建并写入标准 workflow"}
            disabled={busy}
            action={() => {
              void create(false);
            }}
          />
        </GlassGroup>
      </Section>
    </List>
  );
}
