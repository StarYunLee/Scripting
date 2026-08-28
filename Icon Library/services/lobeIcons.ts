import { Script } from "scripting";
import type { UploadDraft } from "./models";
import type { LobeIconCatalogItem } from "./lobeIconsCatalog";
import { buildFilename, sanitizeIconName, splitFilename } from "./names";
import { nextId } from "./id";
import { loadImageFromUrls } from "./imageDownload";

export type LobeIconTheme = "light" | "dark";

export type LobeIconVariant =
  | "mono"
  | "color"
  | "brand"
  | "brand-color"
  | "text"
  | "text-cn"
  | "text-color";

type LobeIconVariantOption = {
  variant: LobeIconVariant;
  label: string;
  suffix: string;
};

// 预览优先 jsDelivr（列表并发更稳）；下载时再带上 npmmirror 兜底。
const PREVIEW_CDN_BASES = [
  "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@latest",
  "https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files",
] as const;

const DOWNLOAD_CDN_BASES = [
  "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@latest",
  "https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files",
  "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-png",
] as const;

const VARIANT_DEFS: Array<{
  variant: LobeIconVariant;
  label: string;
  suffix: string;
  available: (item: LobeIconCatalogItem) => boolean;
}> = [
  {
    variant: "color",
    label: "彩色",
    suffix: "-color",
    available: (item) => item.hasColor,
  },
  {
    variant: "mono",
    label: "单色",
    suffix: "",
    available: () => true,
  },
  {
    variant: "brand",
    label: "品牌",
    suffix: "-brand",
    available: (item) => item.hasBrand,
  },
  {
    variant: "brand-color",
    label: "彩色品牌",
    suffix: "-brand-color",
    available: (item) => item.hasBrandColor,
  },
  {
    variant: "text",
    label: "文字",
    suffix: "-text",
    available: (item) => item.hasText,
  },
  {
    variant: "text-cn",
    label: "中文文字",
    suffix: "-text-cn",
    available: (item) => item.hasTextCn,
  },
  {
    variant: "text-color",
    label: "彩色文字",
    suffix: "-text-color",
    available: (item) => item.hasTextColor,
  },
];


let catalogPromise: Promise<readonly LobeIconCatalogItem[]> | null = null;

function isCatalogItem(value: unknown): value is LobeIconCatalogItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.slug === "string" &&
    typeof item.title === "string" &&
    typeof item.fullTitle === "string" &&
    typeof item.group === "string" &&
    typeof item.color === "string" &&
    typeof item.hasColor === "boolean" &&
    typeof item.hasBrand === "boolean" &&
    typeof item.hasBrandColor === "boolean" &&
    typeof item.hasText === "boolean" &&
    typeof item.hasTextCn === "boolean" &&
    typeof item.hasTextColor === "boolean" &&
    typeof item.hasAvatar === "boolean"
  );
}

export function loadLobeIconsCatalog(): Promise<readonly LobeIconCatalogItem[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const path = `${Script.directory}/resources/lobe-icons.json`;
      const text = await FileManager.readAsString(path);
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Lobe Icons 目录格式无效");
      }
      const catalog = parsed.filter(isCatalogItem);
      if (catalog.length !== parsed.length || catalog.length === 0) {
        throw new Error("Lobe Icons 目录数据不完整");
      }
      return catalog;
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

export function listLobeIcons(
  catalog: readonly LobeIconCatalogItem[],
  query = "",
): LobeIconCatalogItem[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return catalog.slice();
  }
  return catalog.filter((item) => {
    return (
      item.id.toLowerCase().includes(keyword) ||
      item.slug.includes(keyword) ||
      item.title.toLowerCase().includes(keyword) ||
      item.fullTitle.toLowerCase().includes(keyword) ||
      item.group.toLowerCase().includes(keyword)
    );
  });
}

export function getLobeIconById(
  catalog: readonly LobeIconCatalogItem[],
  id: string,
): LobeIconCatalogItem | null {
  return catalog.find((item) => item.id === id) ?? null;
}

export function listLobeVariants(
  item: LobeIconCatalogItem,
): LobeIconVariantOption[] {
  return VARIANT_DEFS.filter((def) => def.available(item)).map((def) => ({
    variant: def.variant,
    label: def.label,
    suffix: def.suffix,
  }));
}

export function defaultLobeVariant(
  item: LobeIconCatalogItem,
): LobeIconVariant {
  const options = listLobeVariants(item);
  // 详情默认优先彩色，其次单色/品牌/文字。
  const preferred: LobeIconVariant[] = [
    "color",
    "mono",
    "brand-color",
    "brand",
    "text",
  ];
  for (const variant of preferred) {
    if (options.some((entry) => entry.variant === variant)) {
      return variant;
    }
  }
  return options[0]?.variant ?? "mono";
}

function variantSuffix(variant: LobeIconVariant): string {
  return VARIANT_DEFS.find((item) => item.variant === variant)?.suffix ?? "";
}

function buildUrls(
  bases: readonly string[],
  options: {
    item: LobeIconCatalogItem;
    variant: LobeIconVariant;
    theme: LobeIconTheme;
  },
): string[] {
  const suffix = variantSuffix(options.variant);
  const file = `${options.item.slug}${suffix}.png`;
  return bases.map((base) => `${base}/${options.theme}/${file}`);
}

export function buildLobeIconUrls(options: {
  item: LobeIconCatalogItem;
  variant: LobeIconVariant;
  theme: LobeIconTheme;
}): string[] {
  return buildUrls(DOWNLOAD_CDN_BASES, options);
}

/**
 * 列表缩略图只返回一个 URL，避免双请求：
 * - hasColor → color
 * - 否则 → mono
 * 列表不做运行时回退（Image 无 onError，叠层回退会必然双加载）。
 * 真正下载入库时再做 mono 回退。
 */
export function buildLobeListPreviewUrl(item: LobeIconCatalogItem): string {
  return buildUrls(PREVIEW_CDN_BASES, {
    item,
    variant: item.hasColor ? "color" : "mono",
    theme: "light",
  })[0];
}

function buildLobeSuggestedName(options: {
  item: LobeIconCatalogItem;
  variant: LobeIconVariant;
  theme: LobeIconTheme;
}): string {
  const suffix = variantSuffix(options.variant).replace(/^-/, "");
  const parts = [options.item.slug];
  if (suffix) {
    parts.push(suffix);
  }
  if (options.theme === "dark") {
    parts.push("dark");
  }
  return sanitizeIconName(parts.join("-")) || options.item.slug;
}


export async function downloadLobeIconAsDraft(options: {
  item: LobeIconCatalogItem;
  variant: LobeIconVariant;
  theme: LobeIconTheme;
}): Promise<UploadDraft> {
  // 先试所选变体；失败再回退 mono，避免元数据 hasColor 与 CDN 不一致。
  const primary = buildLobeIconUrls(options);
  const fallback =
    options.variant === "mono"
      ? []
      : buildLobeIconUrls({
          item: options.item,
          variant: "mono",
          theme: options.theme,
        });

  const image = await loadImageFromUrls([...primary, ...fallback]);
  const data = image.toPNGData();
  if (!data) {
    throw new Error("无法将图标转换为 PNG");
  }

  const suggested = buildLobeSuggestedName(options);
  const filename = buildFilename(suggested, ".png");
  return {
    id: nextId("lobe"),
    name: splitFilename(filename).name,
    filename,
    data,
    preview: image,
    byteSize: data.size,
  };
}
