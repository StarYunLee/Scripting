import { fetch } from "scripting";
import type { UploadDraft } from "./models";
import { buildFilename, sanitizeIconName, splitFilename } from "./names";
import { nextId } from "./id";
import { loadImageFromUrls } from "./imageDownload";

export type AppStoreEntity =
  | "software"
  | "iPadSoftware"
  | "desktopSoftware";

export type AppStoreCountry = "cn" | "us" | "jp" | "hk" | "tw" | "sg";

export type AppStoreResolution = 256 | 512 | 1024;

export type AppStoreCornerStyle = "official" | "original";

export type AppStoreApp = {
  trackId: number;
  trackName: string;
  artistName: string;
  bundleId: string;
  kind: string;
  primaryGenreName: string;
  artworkUrl512: string;
  platform: "iOS" | "iPadOS" | "macOS";
};

export const APP_STORE_COUNTRIES: Array<{
  id: AppStoreCountry;
  title: string;
}> = [
  { id: "cn", title: "CN" },
  { id: "us", title: "US" },
  { id: "jp", title: "JP" },
  { id: "hk", title: "HK" },
  { id: "tw", title: "TW" },
  { id: "sg", title: "SG" },
];

export const APP_STORE_ENTITIES: Array<{
  id: AppStoreEntity;
  title: string;
}> = [
  { id: "software", title: "iOS" },
  { id: "iPadSoftware", title: "iPadOS" },
  { id: "desktopSoftware", title: "macOS" },
];


function platformFromEntity(entity: AppStoreEntity): AppStoreApp["platform"] {
  if (entity === "desktopSoftware") return "macOS";
  if (entity === "iPadSoftware") return "iPadOS";
  return "iOS";
}

function platformFromKind(kind: string | undefined, entity: AppStoreEntity): AppStoreApp["platform"] {
  if (kind?.toLowerCase().includes("mac")) return "macOS";
  return platformFromEntity(entity);
}

const ARTWORK_STYLE_TOKEN: Record<AppStoreCornerStyle, "ia" | "bb"> = {
  official: "ia",
  original: "bb",
};

function artworkStem(source: string): string | null {
  const match = source.match(
    /^(.*)\/\d+x\d+(?:bb|ia)(?:-100)?\.(?:jpg|jpeg|png|webp)/i,
  );
  return match?.[1] ?? null;
}

/**
 * 预览和下载共用同一组 URL，且不跨风格回退：
 * - 官方圆角只使用 ia
 * - 原图只使用 bb / iTunes 方图
 */
function buildAppStoreArtworkUrls(options: {
  artworkUrl512: string;
  resolution: AppStoreResolution;
  style: AppStoreCornerStyle;
}): string[] {
  const source = options.artworkUrl512;
  if (!source) return [];

  const token = `${options.resolution}x${options.resolution}${ARTWORK_STYLE_TOKEN[options.style]}`;
  const stem = artworkStem(source);
  const urls: string[] = [];

  if (options.style === "original" && options.resolution === 512) {
    urls.push(source);
  }

  if (stem) {
    for (const ext of [".png", ".jpg", ".jpeg"] as const) {
      urls.push(`${stem}/${token}${ext}`);
    }
  }

  return [...new Set(urls)];
}

export async function searchAppStore(options: {
  term: string;
  country: AppStoreCountry;
  entity: AppStoreEntity;
  limit?: number;
}): Promise<AppStoreApp[]> {
  const term = options.term.trim();
  if (!term) return [];

  const limit = Math.max(1, Math.min(48, options.limit ?? 18));
  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
    `&country=${options.country}` +
    `&entity=${options.entity}` +
    `&limit=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`App Store 搜索失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    results?: Array<Record<string, unknown>>;
  };

  const results = Array.isArray(payload.results) ? payload.results : [];
  return results
    .map((item) => {
      const artworkUrl512 = String(
        item.artworkUrl512 || item.artworkUrl100 || "",
      );
      const trackId = Number(item.trackId || 0);
      const trackName = String(item.trackName || "").trim();
      if (!trackId || !trackName || !artworkUrl512) {
        return null;
      }
      return {
        trackId,
        trackName,
        artistName: String(item.artistName || "").trim() || "Unknown",
        bundleId: String(item.bundleId || "").trim(),
        kind: String(item.kind || ""),
        primaryGenreName: String(item.primaryGenreName || "").trim() || "App",
        artworkUrl512,
        platform: platformFromKind(String(item.kind || ""), options.entity),
      } satisfies AppStoreApp;
    })
    .filter((item): item is AppStoreApp => item != null);
}

function buildAppStoreSuggestedName(options: {
  app: AppStoreApp;
  resolution: AppStoreResolution;
  style: AppStoreCornerStyle;
}): string {
  const base =
    sanitizeIconName(options.app.trackName) ||
    sanitizeIconName(options.app.bundleId) ||
    `app-${options.app.trackId}`;
  const platform = options.app.platform.toLowerCase();
  const style = options.style === "official" ? "official" : "original";
  return `${base}-${platform}-${options.resolution}-${style}`;
}

export function appStoreArtworkUrl(options: {
  app: AppStoreApp;
  resolution?: AppStoreResolution;
  style?: AppStoreCornerStyle;
}): string {
  const resolution = options.resolution ?? 256;
  const style = options.style ?? "official";
  const urls = buildAppStoreArtworkUrls({
    artworkUrl512: options.app.artworkUrl512,
    resolution,
    style,
  });
  if (urls.length === 0) {
    throw new Error("没有匹配当前规格的 App Store 图标");
  }
  return urls[0];
}

export function appStoreListPreviewUrl(app: AppStoreApp): string {
  return appStoreArtworkUrl({
    app,
    resolution: 256,
    style: "official",
  });
}


export async function downloadAppStoreIconAsDraft(options: {
  app: AppStoreApp;
  resolution?: AppStoreResolution;
  style?: AppStoreCornerStyle;
}): Promise<UploadDraft> {
  const resolution = options.resolution ?? 512;
  const style = options.style ?? "official";
  const urls = buildAppStoreArtworkUrls({
    artworkUrl512: options.app.artworkUrl512,
    resolution,
    style,
  });
  if (urls.length === 0) {
    throw new Error("没有匹配当前规格的 App Store 图标");
  }

  const image = await loadImageFromUrls(urls, "导出失败");
  const data = image.toPNGData();
  if (!data) {
    throw new Error("无法将 App Store 图标转换为 PNG");
  }

  const suggested = buildAppStoreSuggestedName({
    app: options.app,
    resolution,
    style,
  });
  const filename = buildFilename(suggested, ".png");
  return {
    id: nextId("appstore"),
    name: splitFilename(filename).name,
    filename,
    data,
    preview: image,
    byteSize: data.size,
  };
}
