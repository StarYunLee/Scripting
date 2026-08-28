import {
  Button,
  HStack,
  Image,
  LazyVGrid,
  Navigation,
  ScrollView,
  Section,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
  ZStack,
  useEffect,
  useMemo,
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
import { IconGlassTile } from "../components/IconGlassTile";
import { PageBackground } from "../components/PageBackground";
import { formatError } from "../services/errors";
import { confirmAddedDraft, confirmAddedDrafts } from "../services/addDraftFlow";
import { exportPngFile } from "../services/exportPng";
import {
  buildLobeIconUrls,
  buildLobeListPreviewUrl,
  defaultLobeVariant,
  downloadLobeIconAsDraft,
  getLobeIconById,
  listLobeIcons,
  loadLobeIconsCatalog,
  listLobeVariants,
  type LobeIconTheme,
  type LobeIconVariant,
} from "../services/lobeIcons";
import type { LobeIconCatalogItem } from "../services/lobeIconsCatalog";
import type { UploadDraft } from "../services/models";

const PREVIEW_COLUMNS = [
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 10,
    alignment: "top" as const,
  },
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 10,
    alignment: "top" as const,
  },
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 10,
    alignment: "top" as const,
  },
  {
    size: { type: "flexible" as const, min: 1 },
    spacing: 10,
    alignment: "top" as const,
  },
];

export type LobePickMode = "stay" | "back";

function groupLabel(group: string): string {
  if (group === "model") return "模型";
  if (group === "application") return "应用";
  return "提供商";
}

function LobeListThumb(props: {
  item: LobeIconCatalogItem;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  // 每格只请求 1 张图：有 color 用 color，否则 mono。
  const previewUrl = buildLobeListPreviewUrl(props.item);

  return (
    <VStack
      spacing={6}
      alignment="center"
      frame={{ maxWidth: "infinity", alignment: "top" }}
      onTapGesture={props.onOpen}
    >
      <IconGlassTile>
        <ZStack
          alignment="topTrailing"
          frame={{ width: 64, height: 64 }}
        >
          <Image
            imageUrl={previewUrl}
            resizable={true}
            scaleToFit={true}
            frame={{ width: 64, height: 64 }}
            opacity={props.selecting && props.selected ? 0.55 : 1}
            placeholder={<Text>…</Text>}
          />
          {props.selecting ? (
            <Image
              systemName={props.selected ? "checkmark.circle.fill" : "circle"}
              foregroundStyle={props.selected ? "accentColor" : "tertiaryLabel"}
              offset={{ x: 6, y: -6 }}
            />
          ) : null}
        </ZStack>
      </IconGlassTile>
      <Text
        font={11}
        lineLimit={2}
        multilineTextAlignment="center"
        frame={{ maxWidth: "infinity" }}
      >
        {props.item.title}
      </Text>
    </VStack>
  );
}

type LobeStyleOption = {
  variant: LobeIconVariant;
  theme: LobeIconTheme;
  label: string;
  previewUrl: string;
};

function listLobeStyleOptions(
  item: LobeIconCatalogItem,
): LobeStyleOption[] {
  const variants = listLobeVariants(item);
  const styles: LobeStyleOption[] = [];
  for (const v of variants) {
    styles.push({
      variant: v.variant,
      theme: "light",
      label: `${v.label} · 浅色`,
      previewUrl: buildLobeIconUrls({ item, variant: v.variant, theme: "light" })[0],
    });
    styles.push({
      variant: v.variant,
      theme: "dark",
      label: `${v.label} · 深色`,
      previewUrl: buildLobeIconUrls({ item, variant: v.variant, theme: "dark" })[0],
    });
  }
  return styles;
}

function LobeIconDetailPage(props: {
  item: LobeIconCatalogItem;
  onPicked: (draft: UploadDraft, mode: LobePickMode) => void;
}) {
  const dismiss = Navigation.useDismiss();
  const styles = useMemo(() => listLobeStyleOptions(props.item), [props.item]);
  const defaultVar = defaultLobeVariant(props.item);
  const [selectedStyle, setSelectedStyle] = useState<LobeStyleOption>(
    () =>
      styles.find((s) => s.variant === defaultVar && s.theme === "light") ??
      styles[0],
  );
  const [busy, setBusy] = useState<"upload" | "export" | null>(null);
  const previewUrl = buildLobeIconUrls({
    item: props.item,
    variant: selectedStyle.variant,
    theme: selectedStyle.theme,
  })[0];

  async function loadCurrentDraft() {
    return downloadLobeIconAsDraft({
      item: props.item,
      variant: selectedStyle.variant,
      theme: selectedStyle.theme,
    });
  }

  async function addToUpload() {
    if (busy) return;
    setBusy("upload");
    try {
      const draft = await loadCurrentDraft();
      const mode = await confirmAddedDraft(draft);
      props.onPicked(draft, mode);
      dismiss();
    } catch (error) {
      await Dialog.alert({
        title: "加入失败",
        message: formatError(error),
      });
    } finally {
      setBusy(null);
    }
  }

  async function exportPng() {
    if (busy) return;
    setBusy("export");
    try {
      const draft = await loadCurrentDraft();
      await exportPngFile({
        filename: draft.filename,
        data: draft.data,
      });
    } catch (error) {
      await Dialog.alert({
        title: "导出失败",
        message: formatError(error),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <List
      navigationTitle={props.item.title}
      {...glassListPageProps()}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="预览" />}
      >
        <GlassGroup>
          <VStack
            alignment="center"
            spacing={12}
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity" }}
          >
            <VStack
              padding={10}
              frame={{ width: 116, height: 116 }}
              glassEffect={{
                glass: UIGlass.regular(),
                shape: {
                  type: "rect",
                  cornerRadius: 24,
                  style: "continuous",
                },
              }}
              background={
                selectedStyle.theme === "dark"
                  ? {
                      style: "rgba(17, 24, 39, 0.88)",
                      shape: {
                        type: "rect",
                        cornerRadius: 24,
                        style: "continuous",
                      },
                    }
                  : undefined
              }
            >
              <Image
                imageUrl={previewUrl}
                resizable={true}
                scaleToFit={true}
                frame={{ width: 96, height: 96 }}
                placeholder={<Text>…</Text>}
              />
            </VStack>
            <Text font={15} fontWeight="medium">
              {props.item.fullTitle}
            </Text>
            <Text font={12} foregroundStyle="secondaryLabel">
              {`${props.item.slug} · ${groupLabel(props.item.group)} · ${selectedStyle.label}`}
            </Text>
          </VStack>
        </GlassGroup>
      </Section>

      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="可选款式" />}
      >
        <GlassGroup>
          {styles.map((style, idx) => {
            const isSelected =
              style.variant === selectedStyle.variant &&
              style.theme === selectedStyle.theme;
            return (
              <VStack key={`${style.variant}-${style.theme}`} spacing={0} frame={{ maxWidth: "infinity" }}>
                <Button
                  buttonStyle="plain"
                  frame={{ maxWidth: "infinity" }}
                  action={() => setSelectedStyle(style)}
                >
                  <HStack
                    spacing={12}
                    padding={{ vertical: true }}
                    frame={{ minHeight: 60, maxWidth: "infinity" }}
                    contentShape="rect"
                  >
                    <VStack
                      padding={4}
                      frame={{ width: 44, height: 44 }}
                      glassEffect={{
                        glass: UIGlass.regular(),
                        shape: {
                          type: "rect",
                          cornerRadius: 12,
                          style: "continuous",
                        },
                      }}
                      background={
                        style.theme === "dark"
                          ? {
                              style: "rgba(17, 24, 39, 0.88)",
                              shape: {
                                type: "rect",
                                cornerRadius: 12,
                                style: "continuous",
                              },
                            }
                          : undefined
                      }
                    >
                      <Image
                        imageUrl={style.previewUrl}
                        resizable={true}
                        scaleToFit={true}
                        frame={{ width: 36, height: 36 }}
                        placeholder={<Text>…</Text>}
                      />
                    </VStack>

                    <VStack
                      alignment="leading"
                      spacing={4}
                      frame={{ maxWidth: "infinity", alignment: "leading" }}
                    >
                      <Text font={15} fontWeight={isSelected ? "medium" : "regular"}>
                        {style.label}
                      </Text>
                      <Text
                        font={12}
                        foregroundStyle="secondaryLabel"
                      >
                        {`${props.item.slug}${style.variant === "mono" ? "" : `-${style.variant}`}${style.theme === "dark" ? "-dark" : ""}.png`}
                      </Text>
                    </VStack>

                    {isSelected ? (
                      <Image
                        systemName="checkmark.circle.fill"
                        foregroundStyle="accentColor"
                      />
                    ) : null}
                  </HStack>
                </Button>
                {idx < styles.length - 1 ? <GlassDivider /> : null}
              </VStack>
            );
          })}
        </GlassGroup>
      </Section>

      <Section listRowBackground={glassRowBackground}>
        <GlassGroup>
          <GlassActionRow
            title={
              busy === "upload"
                ? "加入中…"
                : `加入「${selectedStyle.label}」到上传列表`
            }
            disabled={busy != null}
            action={() => {
              void addToUpload();
            }}
          />
          <GlassDivider />
          <GlassActionRow
            title={busy === "export" ? "导出中…" : "导出 PNG"}
            disabled={busy != null}
            action={() => {
              void exportPng();
            }}
          />
        </GlassGroup>
      </Section>
    </List>
  );
}

export function LobeIconsPickerPage(props: {
  onPicked: (draft: UploadDraft | UploadDraft[], mode: LobePickMode) => void;
}) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<readonly LobeIconCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoadingCatalog(true);
    setCatalogError(null);
    void loadLobeIconsCatalog()
      .then((items) => {
        if (active) {
          setCatalog(items);
        }
      })
      .catch((error) => {
        if (active) {
          setCatalogError(formatError(error));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingCatalog(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // 目录只在进入本页后加载；过滤结果继续交给 LazyVGrid 懒渲染。
  const icons = useMemo(() => listLobeIcons(catalog, query), [catalog, query]);
  const selected =
    !selecting && selectedId
      ? getLobeIconById(catalog, selectedId)
      : null;

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function exitSelecting() {
    setSelecting(false);
    setSelectedIds([]);
  }

  async function addSelected() {
    if (busy || selectedIds.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const drafts: UploadDraft[] = [];
      const failures: string[] = [];
      for (const id of selectedIds) {
        const item = getLobeIconById(catalog, id);
        if (!item) {
          failures.push(id);
          continue;
        }
        try {
          drafts.push(
            await downloadLobeIconAsDraft({
              item,
              variant: defaultLobeVariant(item),
              theme: "light",
            }),
          );
        } catch (error) {
          failures.push(`${item.title}：${formatError(error)}`);
        }
      }
      if (drafts.length === 0) {
        await Dialog.alert({
          title: "加入失败",
          message: failures.join("\n") || "没有可加入的图标",
        });
        return;
      }
      const mode = await confirmAddedDrafts(drafts);
      props.onPicked(drafts, mode);
      if (failures.length > 0) {
        await Dialog.alert({
          title: "部分加入失败",
          message: failures.join("\n"),
        });
      }
      exitSelecting();
    } catch (error) {
      await Dialog.alert({
        title: "加入失败",
        message: formatError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  const toolbar = selecting ? (
    <Toolbar>
      <ToolbarItem placement="cancellationAction">
        <Button title="取消" action={exitSelecting} />
      </ToolbarItem>
      <ToolbarItem placement="primaryAction">
        <Button
          title={
            busy
              ? "加入中…"
              : `加入${selectedIds.length ? ` ${selectedIds.length}` : ""}`
          }
          disabled={busy || selectedIds.length === 0}
          action={() => {
            void addSelected();
          }}
        />
      </ToolbarItem>
    </Toolbar>
  ) : (
    <Toolbar>
      <ToolbarItem placement="primaryAction">
        <Button
          title="选择"
          disabled={loadingCatalog || catalogError != null}
          action={() => {
            setSelecting(true);
            setSelectedIds([]);
            setSelectedId(null);
          }}
        />
      </ToolbarItem>
    </Toolbar>
  );

  return (
    <ScrollView
      navigationTitle={selecting ? `已选 ${selectedIds.length}` : "Lobe Icons"}
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      background={<PageBackground />}
      searchable={{
        value: query,
        onChanged: setQuery,
        prompt: "搜索 Lobe 模型 / 提供商图标",
        placement: "navigationBarDrawerAlwaysDisplay",
      }}
      toolbar={toolbar}
      navigationDestination={{
        isPresented: selected != null,
        onChanged: (value: boolean) => {
          if (!value) setSelectedId(null);
        },
        content: selected ? (
          <LobeIconDetailPage
            key={selected.id}
            item={selected}
            onPicked={props.onPicked}
          />
        ) : (
          <Text>选择图标</Text>
        ),
      }}
    >
      <VStack
        spacing={10}
        padding={{ horizontal: 16, top: 8, bottom: 24 }}
        frame={{ maxWidth: "infinity", alignment: "top" }}
      >
        <Text font={13} foregroundStyle="secondaryLabel">
          {loadingCatalog
            ? "正在载入 Lobe Icons 目录…"
            : catalogError
              ? "Lobe Icons 目录载入失败"
              : selecting
                ? "多选使用默认款式：有彩色用彩色，否则单色；主题为浅色"
                : `Lobe Icons · ${icons.length}`}
        </Text>

        {loadingCatalog ? (
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: 20 }}
              frame={{ maxWidth: "infinity" }}
            >
              正在载入图标目录…
            </Text>
          ) : catalogError ? (
            <VStack
              spacing={8}
              padding={{ vertical: 20 }}
              frame={{ maxWidth: "infinity" }}
            >
              <Text foregroundStyle="systemRed">目录载入失败</Text>
              <Text font={12} foregroundStyle="secondaryLabel">
                {catalogError}
              </Text>
            </VStack>
          ) : icons.length === 0 ? (
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: 20 }}
              frame={{ maxWidth: "infinity" }}
            >
              没有匹配的 Lobe 图标
            </Text>
          ) : (
            <LazyVGrid
              columns={PREVIEW_COLUMNS}
              spacing={14}
              alignment="center"
              frame={{ maxWidth: "infinity" }}
            >
              {icons.map((item) => (
                <LobeListThumb
                  key={item.id}
                  item={item}
                  selecting={selecting}
                  selected={selectedIds.includes(item.id)}
                  onOpen={() => {
                    if (selecting) {
                      toggleSelected(item.id);
                      return;
                    }
                    setSelectedId(item.id);
                  }}
                />
              ))}
            </LazyVGrid>
        )}
      </VStack>
    </ScrollView>
  );
}
