import { fetch } from "scripting";
import { nextId } from "./id";
import type {
  CatalogIcon,
  CatalogSnapshot,
  RemoteLibrary,
  RemoteLibraryStore,
} from "./models";
import { filenameFromUrl } from "./names";

const STORE_KEY = "icon_library_remote_libraries_v1";
const CACHE_KEY_PREFIX = "icon_library_remote_catalog_v1:";

type RawCatalog = {
  name?: unknown;
  description?: unknown;
  icons?: unknown;
};

function emptyStore(): RemoteLibraryStore {
  return { libraries: [], currentId: null };
}

function normalizeUrl(raw: string): string {
  return raw.trim();
}

export function parseRemoteJsonUrl(raw: string): string {
  const value = normalizeUrl(raw);
  if (!value) {
    throw new Error("请填写图标库 JSON 地址。");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("地址无效。请填写完整的 https 链接。");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("只支持 https 地址。");
  }
  return parsed.toString();
}

function defaultTitleFromUrl(jsonUrl: string): string {
  try {
    const parsed = new URL(jsonUrl);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last.replace(/\.json$/i, "")) || "未命名订阅";
  } catch {
    return "未命名订阅";
  }
}

function asStore(value: unknown): RemoteLibraryStore {
  if (!value || typeof value !== "object") {
    return emptyStore();
  }
  const record = value as Partial<RemoteLibraryStore>;
  const libraries = Array.isArray(record.libraries)
    ? record.libraries.filter((item): item is RemoteLibrary => {
        return (
          Boolean(item) &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.jsonUrl === "string" &&
          typeof item.addedAt === "number"
        );
      })
    : [];
  const currentId =
    typeof record.currentId === "string" &&
    libraries.some((item) => item.id === record.currentId)
      ? record.currentId
      : (libraries[0]?.id ?? null);
  return { libraries, currentId };
}

export function loadRemoteLibraryStore(): RemoteLibraryStore {
  try {
    return asStore(Storage.get<RemoteLibraryStore>(STORE_KEY));
  } catch {
    return emptyStore();
  }
}

function saveStore(store: RemoteLibraryStore): RemoteLibraryStore {
  Storage.set(STORE_KEY, store);
  return store;
}

export function getCurrentRemoteLibrary(
  store: RemoteLibraryStore = loadRemoteLibraryStore(),
): RemoteLibrary | null {
  return store.libraries.find((item) => item.id === store.currentId) ?? null;
}

export function selectRemoteLibrary(id: string): RemoteLibraryStore {
  const store = loadRemoteLibraryStore();
  if (!store.libraries.some((item) => item.id === id)) {
    throw new Error("订阅不存在。");
  }
  return saveStore({ ...store, currentId: id });
}

export function renameRemoteLibrary(
  id: string,
  title: string,
): RemoteLibraryStore {
  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error("订阅名称不能为空。");
  }
  const store = loadRemoteLibraryStore();
  return saveStore({
    ...store,
    libraries: store.libraries.map((item) =>
      item.id === id ? { ...item, title: nextTitle } : item,
    ),
  });
}

export function removeRemoteLibrary(id: string): RemoteLibraryStore {
  const store = loadRemoteLibraryStore();
  const libraries = store.libraries.filter((item) => item.id !== id);
  Storage.remove(`${CACHE_KEY_PREFIX}${id}`);
  return saveStore({
    libraries,
    currentId:
      store.currentId === id ? (libraries[0]?.id ?? null) : store.currentId,
  });
}

function parseRemoteCatalog(
  text: string,
  jsonUrl: string,
): CatalogSnapshot {
  let parsed: RawCatalog;
  try {
    parsed = JSON.parse(text) as RawCatalog;
  } catch {
    throw new Error("返回内容不是有效 JSON。");
  }
  if (!Array.isArray(parsed.icons)) {
    throw new Error("JSON 缺少 icons 数组，无法作为图标库索引。");
  }

  const icons: CatalogIcon[] = [];
  for (const item of parsed.icons) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as { name?: unknown; url?: unknown };
    if (typeof record.url !== "string" || !record.url.trim()) {
      continue;
    }
    const filename = filenameFromUrl(record.url) || "icon.png";
    icons.push({
      name:
        typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : filename.replace(/\.[^.]+$/, ""),
      filename,
      url: record.url.trim(),
    });
  }

  return {
    title:
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : defaultTitleFromUrl(jsonUrl),
    description:
      typeof parsed.description === "string" ? parsed.description : "",
    icons,
    fetchedAt: Date.now(),
    source: "raw",
  };
}

export function loadCachedRemoteCatalog(
  id: string,
): CatalogSnapshot | null {
  try {
    return Storage.get<CatalogSnapshot>(`${CACHE_KEY_PREFIX}${id}`);
  } catch {
    return null;
  }
}

export async function fetchRemoteCatalog(
  jsonUrl: string,
): Promise<CatalogSnapshot> {
  const url = parseRemoteJsonUrl(jsonUrl);
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    headers: { "User-Agent": "Icon-Library" },
    timeout: 20,
  });
  if (response.status === 404) {
    throw new Error("找不到这份 JSON。请确认地址，或确认仓库是公开的。");
  }
  if (!response.ok) {
    throw new Error(`读取索引失败：HTTP ${response.status}`);
  }
  return parseRemoteCatalog(await response.text(), url);
}

export async function addRemoteLibrary(options: {
  jsonUrl: string;
  title?: string;
}): Promise<{ store: RemoteLibraryStore; snapshot: CatalogSnapshot }> {
  const jsonUrl = parseRemoteJsonUrl(options.jsonUrl);
  const store = loadRemoteLibraryStore();
  const existing = store.libraries.find((item) => item.jsonUrl === jsonUrl);
  if (existing) {
    throw new Error("这个图标库已经添加过了。");
  }

  const snapshot = await fetchRemoteCatalog(jsonUrl);
  const title = options.title?.trim() || snapshot.title || defaultTitleFromUrl(jsonUrl);
  const library: RemoteLibrary = {
    id: nextId("gallery"),
    title,
    jsonUrl,
    addedAt: Date.now(),
  };
  Storage.set(`${CACHE_KEY_PREFIX}${library.id}`, snapshot);
  return {
    store: saveStore({
      libraries: [...store.libraries, library],
      currentId: library.id,
    }),
    snapshot,
  };
}

export async function refreshRemoteCatalog(
  library: RemoteLibrary,
): Promise<CatalogSnapshot> {
  const snapshot = await fetchRemoteCatalog(library.jsonUrl);
  Storage.set(`${CACHE_KEY_PREFIX}${library.id}`, snapshot);
  return snapshot;
}
