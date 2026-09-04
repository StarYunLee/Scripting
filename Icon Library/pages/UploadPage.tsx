import {
  Image,
  NavigationStack,
  Rectangle,
  Section,
  Text,
  TextField,
  VStack,
  useState,
  List,
} from "scripting";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import { findIconByFilename } from "../services/catalog";
import { formatError } from "../services/errors";
import { getGithubAvailability } from "../services/github";
import { uploadIcons } from "../services/icons";
import type {
  CatalogSnapshot,
  IconLibrarySettings,
  RepoContext,
  UploadDraft,
} from "../services/models";
import {
  pickFilesAsDrafts,
  pickPhotosAsDrafts,
  renameDraft,
} from "../services/picker";
import { hasStandardWorkflow, rebuildIndexFromDirectory } from "../services/library";
import { isLibraryReady } from "../services/settings";
import {
  AppStoreIconsPickerPage,
  type AppStorePickMode,
} from "./AppStoreIconsPickerPage";
import {
  LobeIconsPickerPage,
  type LobePickMode,
} from "./LobeIconsPickerPage";
import { useRootToolbar } from "./rootToolbar";
import { promptForProfilePat } from "./patGuide";

const EMPTY_STATUS = "从相册、文件、Lobe Icons 或 App Store 选择要上传的图标";

type PickerSource = "lobe" | "appstore" | null;

function StatusFooter(props: { text: string }) {
  return (
    <Text
      font="caption"
      foregroundStyle="secondaryLabel"
      listRowBackground={<Rectangle fill="clear" />}
      listRowSeparator="hidden"
    >
      {props.text}
    </Text>
  );
}

export function UploadPage(props: {
  profileId: string;
  settings: IconLibrarySettings;
  catalog: CatalogSnapshot | null;
  onUploaded: () => Promise<void>;
  onOpenIcons: () => void;
  onOpenSettings: () => void;
}) {
  const {
    profileId,
    settings,
    catalog,
    onUploaded,
    onOpenIcons,
    onOpenSettings,
  } = props;
  const context: RepoContext = { profileId, settings };
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [pickerSource, setPickerSource] = useState<PickerSource>(null);
  // 每次打开外部选择器递增 key，强制 remount，避免缓存上次搜索结果。
  const [pickerSession, setPickerSession] = useState(0);
  const toolbar = useRootToolbar();

  function openPicker(source: Exclude<PickerSource, null>) {
    setPickerSession((n) => n + 1);
    setPickerSource(source);
  }

  function syncStatus(nextDrafts: UploadDraft[], preferred?: string) {
    if (preferred) {
      setStatus(preferred);
      return;
    }
    if (nextDrafts.length === 0) {
      setStatus(EMPTY_STATUS);
      return;
    }
    setStatus(`待上传 ${nextDrafts.length} 个文件`);
  }

  function appendDrafts(picked: UploadDraft[], label: string) {
    if (picked.length === 0) {
      return;
    }
    setDrafts((current) => {
      const next = [...current, ...picked];
      syncStatus(
        next,
        `${label} ${picked.length} 个，当前待上传 ${next.length} 个`,
      );
      return next;
    });
  }

  async function addDrafts(kind: "photos" | "files") {
    try {
      const picked =
        kind === "photos" ? await pickPhotosAsDrafts() : await pickFilesAsDrafts();
      appendDrafts(picked, "已加入");
    } catch (error) {
      await Dialog.alert({
        title: "选择图片失败",
        message: formatError(error),
      });
    }
  }

  function handleExternalPick(
    draft: UploadDraft | UploadDraft[],
    mode: "stay" | "back",
    label: string,
  ) {
    appendDrafts(Array.isArray(draft) ? draft : [draft], label);
    if (mode === "back") {
      setPickerSource(null);
    }
  }

  function updateDraft(id: string, name: string) {
    setDrafts((current) =>
      current.map((item) => (item.id === id ? renameDraft(item, name) : item)),
    );
  }

  function removeDraft(id: string) {
    setDrafts((current) => {
      const next = current.filter((item) => item.id !== id);
      syncStatus(next);
      return next;
    });
  }

  async function confirmOverwrite(
    draftsToUpload: UploadDraft[],
  ): Promise<UploadDraft[] | null> {
    const accepted: UploadDraft[] = [];
    for (const draft of draftsToUpload) {
      const exists = catalog
        ? Boolean(findIconByFilename(catalog, draft.filename))
        : false;
      if (!exists) {
        accepted.push(draft);
        continue;
      }
      const action = await Dialog.actionSheet({
        title: "文件已存在",
        message: `${draft.filename} 已在库中。`,
        actions: [{ label: "覆盖" }, { label: "跳过" }],
      });
      if (action === 0) {
        accepted.push(draft);
        continue;
      }
      if (action === 1) {
        continue;
      }
      return null;
    }
    return accepted;
  }

  async function uploadAll() {
    if (!isLibraryReady(settings)) {
      await Dialog.alert({
        title: "尚未配置图标库",
        message: "请先在设置中保存仓库，再创建或连接图标库。",
      });
      return;
    }
    const availability = getGithubAvailability(profileId);
    if (!availability.hasPat) {
      await promptForProfilePat(onOpenSettings, availability.summary);
      return;
    }
    if (drafts.length === 0) {
      setStatus("还没有待上传的文件");
      return;
    }

    const accepted = await confirmOverwrite(drafts);
    if (accepted == null) {
      syncStatus(drafts, "已取消提交");
      return;
    }
    const skipped = drafts.filter(
      (draft) => !accepted.some((item) => item.id === draft.id),
    );
    if (accepted.length === 0) {
      syncStatus(skipped, "没有文件被上传");
      return;
    }

    setBusy(true);
    try {
      await uploadIcons({
        context,
        files: accepted.map((draft) => ({
          filename: draft.filename,
          data: draft.data,
        })),
      });
      setDrafts(skipped);

      let statusText =
        skipped.length === 0
          ? `已上传 ${accepted.length} 个文件`
          : `已上传 ${accepted.length} 个，跳过 ${skipped.length} 个`;
      if (settings.mode === "create") {
        try {
          const managed = await hasStandardWorkflow(context);
          if (managed) {
            statusText += "，索引将由 Actions 更新";
          } else {
            await rebuildIndexFromDirectory(context);
            statusText += "，索引已写入仓库";
          }
        } catch (error) {
          statusText += `，索引未更新：${formatError(error)}`;
        }
      }
      syncStatus(skipped, statusText);
      await onUploaded();
    } catch (error) {
      await Dialog.alert({
        title: "上传失败",
        message: formatError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  const showUploadedAction =
    drafts.length === 0 && status.includes("已上传");

  return (
    <NavigationStack>
      <List
        navigationTitle="上传"
        {...glassListPageProps()}
        toolbar={toolbar}
        navigationDestination={{
          isPresented: pickerSource != null,
          onChanged: (value: boolean) => {
            if (!value) setPickerSource(null);
          },
          content:
            pickerSource === "lobe" ? (
              <LobeIconsPickerPage
                key={`lobe-${pickerSession}`}
                onPicked={(draft, mode: LobePickMode) =>
                  handleExternalPick(draft, mode, "已从 Lobe Icons 加入")
                }
              />
            ) : pickerSource === "appstore" ? (
              <AppStoreIconsPickerPage
                key={`appstore-${pickerSession}`}
                onPicked={(draft, mode: AppStorePickMode) =>
                  handleExternalPick(draft, mode, "已从 App Store 加入")
                }
              />
            ) : (
              <Text>选择来源</Text>
            ),
        }}
      >
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="选择图片" />}
          footer={
            status !== EMPTY_STATUS || drafts.length > 0 ? (
              <StatusFooter text={status} />
            ) : undefined
          }
        >
          <GlassGroup>
            <GlassActionRow
              title="从相册选择"
              action={() => addDrafts("photos")}
            />
            <GlassDivider />
            <GlassActionRow
              title="从文件选择"
              action={() => addDrafts("files")}
            />
            <GlassDivider />
            <GlassActionRow
              title="从 Lobe Icons 选择"
              action={() => openPicker("lobe")}
            />
            <GlassDivider />
            <GlassActionRow
              title="从 App Store 选择"
              action={() => openPicker("appstore")}
            />
          </GlassGroup>
        </Section>

        {drafts.map((draft) => (
          <Section
            key={draft.id}
            listRowBackground={glassRowBackground}
            header={<GlassSectionHeader title={draft.filename} />}
          >
            <GlassGroup>
              <VStack
                alignment="leading"
                spacing={12}
                padding={{ vertical: true }}
                frame={{ maxWidth: "infinity" }}
              >
                {draft.preview ? (
                  <Image
                    image={draft.preview}
                    resizable={true}
                    scaleToFit={true}
                    frame={{ width: 96, height: 96 }}
                  />
                ) : (
                  <Text foregroundStyle="secondaryLabel">无法预览</Text>
                )}
                <VStack
                  alignment="leading"
                  spacing={6}
                  frame={{ maxWidth: "infinity" }}
                >
                  <Text font={13} foregroundStyle="secondaryLabel">
                    文件名（可编辑）
                  </Text>
                  <TextField
                    title="文件名"
                    prompt="输入上传后的文件名"
                    value={draft.name}
                    onChanged={(value) => updateDraft(draft.id, value)}
                    textFieldStyle="roundedBorder"
                    frame={{ maxWidth: "infinity" }}
                  />
                  <Text font={12} foregroundStyle="tertiaryLabel">
                    {`${draft.filename} · ${Math.round(draft.byteSize / 1024)} KB`}
                  </Text>
                </VStack>
              </VStack>
              <GlassDivider />
              <GlassActionRow
                title="移除"
                destructive={true}
                action={() => removeDraft(draft.id)}
              />
            </GlassGroup>
          </Section>
        ))}

        {drafts.length > 0 ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <GlassActionRow
                title={busy ? "正在提交…" : "提交到仓库"}
                disabled={busy}
                action={() => {
                  void uploadAll();
                }}
              />
            </GlassGroup>
          </Section>
        ) : showUploadedAction ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <GlassActionRow title="查看图标库" action={onOpenIcons} />
            </GlassGroup>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  );
}
