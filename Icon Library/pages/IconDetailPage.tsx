import {
  Image,
  Navigation,
  Section,
  Text,
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
import { formatError } from "../services/errors";
import { exportPngFile } from "../services/exportPng";
import { deleteIcon, renameIcon } from "../services/icons";
import { hasStandardWorkflow, rebuildIndexFromDirectory } from "../services/library";
import type {
  CatalogIcon,
  IconLibrarySettings,
  RepoContext,
} from "../services/models";
import { buildFilename, splitFilename } from "../services/names";
import { handleMissingProfilePat } from "./patGuide";

export function IconDetailPage(props: {
  profileId?: string;
  icon: CatalogIcon;
  settings?: IconLibrarySettings;
  readOnly?: boolean;
  onChanged?: () => Promise<void>;
  onOpenSettings?: () => void;
}) {
  const {
    profileId,
    icon,
    settings,
    readOnly,
    onChanged,
    onOpenSettings,
  } = props;
  const context: RepoContext | null =
    profileId && settings ? { profileId, settings } : null;
  const dismiss = Navigation.useDismiss();
  const [busy, setBusy] = useState(false);
  const status = readOnly
    ? "只读订阅"
    : icon.pending
      ? "索引尚未刷新"
      : "已同步";


  async function maybeMaintainIndex(): Promise<string> {
    if (!context) {
      return "只读订阅不维护索引";
    }
    if (context.settings.mode === "connect") {
      return "已有库不维护索引";
    }
    try {
      const managed = await hasStandardWorkflow(context);
      if (managed) {
        return "等待标准 Actions 更新索引";
      }
      await rebuildIndexFromDirectory(context);
      return "已把索引写入仓库";
    } catch (error) {
      return `文件已更新，索引未写入：${formatError(error)}`;
    }
  }

  async function copyText(value: string, label: string) {
    await Pasteboard.setString(value);
    await Dialog.alert({
      title: "已复制",
      message: `${label}已复制到剪贴板。`,
    });
  }

  async function exportPng() {
    if (busy) return;
    setBusy(true);
    try {
      await exportPngFile({
        filename: icon.filename,
        urls: [icon.url],
      });
    } catch (error) {
      await Dialog.alert({
        title: "导出失败",
        message: formatError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!context || !onChanged) {
      return;
    }
    const next = await Dialog.prompt({
      title: "重命名图标",
      message: "只改文件名，扩展名保持不变。",
      defaultValue: splitFilename(icon.filename).name,
    });
    if (!next) {
      return;
    }

    const filename = buildFilename(next, splitFilename(icon.filename).ext);
    if (filename === icon.filename) {
      return;
    }

    const confirmed = await Dialog.confirm({
      title: "确认重命名",
      message: `${icon.filename} → ${filename}\n会先写新文件再删旧文件。`,
      confirmLabel: "重命名",
    });
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await renameIcon({
        context,
        fromFilename: icon.filename,
        toFilename: filename,
      });
      const note = await maybeMaintainIndex();
      await Dialog.alert({
        title: "已重命名",
        message: `${icon.filename} → ${filename}\n${note}`,
      });
      await onChanged();
      dismiss();
    } catch (error) {
      if (
        onOpenSettings &&
        (await handleMissingProfilePat(error, onOpenSettings))
      ) {
        return;
      }
      await Dialog.alert({
        title: "重命名失败",
        message: formatError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!context || !onChanged) {
      return;
    }
    const confirmed = await Dialog.confirm({
      title: "删除图标",
      message: `确定删除 ${icon.filename}？订阅端会在 Actions 完成后看不到它。`,
      confirmLabel: "删除",
    });
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await deleteIcon({
        context,
        filename: icon.filename,
        sha: icon.sha,
      });
      const note = await maybeMaintainIndex();
      await Dialog.alert({
        title: "已删除",
        message: `${icon.filename} 已从仓库移除。\n${note}`,
      });
      await onChanged();
      dismiss();
    } catch (error) {
      if (
        onOpenSettings &&
        (await handleMissingProfilePat(error, onOpenSettings))
      ) {
        return;
      }
      await Dialog.alert({
        title: "删除失败",
        message: formatError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <List
      navigationTitle={icon.filename}
      {...glassListPageProps()}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="预览" />}
      >
        <GlassGroup>
          <VStack
            alignment="center"
            spacing={10}
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            <Image
              imageUrl={icon.url}
              resizable={true}
              scaleToFit={true}
              frame={{ width: 160, height: 160 }}
              placeholder={<Text>加载中</Text>}
            />
            <Text font={15} fontWeight="medium">
              {icon.filename}
            </Text>
            <Text font={13} foregroundStyle="secondaryLabel">
              {status}
            </Text>
            {busy ? (
              <Text font={13} foregroundStyle="secondaryLabel">
                处理中…
              </Text>
            ) : null}
          </VStack>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="链接" />}
      >
        <GlassGroup>
          <VStack
            alignment="leading"
            spacing={8}
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            <Text font={13} foregroundStyle="secondaryLabel">
              {icon.url}
            </Text>
          </VStack>
          <GlassDivider />
          <GlassActionRow
            title="复制名称"
            action={() => copyText(icon.name, "名称")}
          />
          <GlassDivider />
          <GlassActionRow
            title="复制文件名"
            action={() => copyText(icon.filename, "文件名")}
          />
          <GlassDivider />
          <GlassActionRow
            title="复制 raw URL"
            action={() => copyText(icon.url, "链接")}
          />
          <GlassDivider />
          <GlassActionRow
            title={busy ? "导出中…" : "导出 PNG"}
            disabled={busy}
            action={() => {
              void exportPng();
            }}
          />
        </GlassGroup>
      </Section>

      {readOnly || !settings || !onChanged ? null : (
        <Section
          listRowBackground={glassRowBackground}
          header={<GlassSectionHeader title="管理" />}
        >
          <GlassGroup>
            <GlassActionRow title="重命名" action={rename} disabled={busy} />
            <GlassDivider />
            <GlassActionRow
              title="删除"
              destructive={true}
              action={remove}
              disabled={busy}
            />
          </GlassGroup>
        </Section>
      )}
    </List>
  );
}
