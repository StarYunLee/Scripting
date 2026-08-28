import { listPath } from "./github";
import type {
  CatalogIcon,
  CatalogSnapshot,
  IconLibrarySettings,
  PendingUpload,
  RepoContext,
} from "./models";
import { isAllowedExtension, splitFilename } from "./names";
import {
  isLibraryReady,
  rawFileUrl,
} from "./settings";

const CACHE_KEY_PREFIX = "icon_library_catalog_cache_v3:";
const PENDING_KEY_PREFIX = "icon_library_pending_uploads_v3:";

type CachedCatalogEnvelope = {
  repoKey: string;
  snapshot: CatalogSnapshot;
};

function repoStorageKey(settings: IconLibrarySettings): string {
  return [
    settings.owner.trim().toLowerCase(),
    settings.repo.trim().toLowerCase(),
    settings.branch.trim().toLowerCase() || "main",
    settings.iconDir.trim().toLowerCase(),
    settings.jsonPath.trim().toLowerCase(),
    settings.mode,
  ].join("|");
}

function cacheKey(settings: IconLibrarySettings): string {
  return `${CACHE_KEY_PREFIX}${repoStorageKey(settings)}`;
}

function pendingKey(settings: IconLibrarySettings): string {
  return `${PENDING_KEY_PREFIX}${repoStorageKey(settings)}`;
}

function snapshotFromDirectory(
  settings: IconLibrarySettings,
  files: Array<{ name: string; sha?: string }>,
): CatalogSnapshot {
  const icons = files
    .filter((item) => isAllowedExtension(splitFilename(item.name).ext || ""))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((item) => ({
      name: splitFilename(item.name).name,
      filename: item.name,
      url: rawFileUrl(settings, `${settings.iconDir}/${item.name}`),
      sha: item.sha,
    }));
  return {
    title: `${settings.owner}/${settings.repo}`,
    description: "",
    icons,
    fetchedAt: Date.now(),
    source: "directory",
    indexMissing: true,
  };
}

function loadPending(settings: IconLibrarySettings): PendingUpload[] {
  if (!isLibraryReady(settings)) {
    return [];
  }
  try {
    return Storage.get<PendingUpload[]>(pendingKey(settings)) ?? [];
  } catch {
    return [];
  }
}

function savePending(
  settings: IconLibrarySettings,
  items: PendingUpload[],
): void {
  if (!isLibraryReady(settings)) {
    return;
  }
  Storage.set(pendingKey(settings), items);
}

export function markPendingUpload(
  settings: IconLibrarySettings,
  filename: string,
  name: string,
): void {
  const next = loadPending(settings).filter(
    (item) => item.filename !== filename,
  );
  next.unshift({
    name,
    filename,
    createdAt: Date.now(),
  });
  savePending(settings, next.slice(0, 20));
}

export function clearPendingUpload(
  settings: IconLibrarySettings,
  filename: string,
): void {
  savePending(
    settings,
    loadPending(settings).filter((item) => item.filename !== filename),
  );
}

function mergePending(
  snapshot: CatalogSnapshot,
  settings: IconLibrarySettings,
): CatalogSnapshot {
  const pending = loadPending(settings);
  if (pending.length === 0) {
    return snapshot;
  }

  const known = new Set(
    snapshot.icons.map((item) => item.filename.toLowerCase()),
  );
  const extras: CatalogIcon[] = [];
  const remaining: PendingUpload[] = [];

  for (const item of pending) {
    if (known.has(item.filename.toLowerCase())) {
      continue;
    }
    remaining.push(item);
    extras.push({
      name: item.name,
      filename: item.filename,
      url: rawFileUrl(settings, `${settings.iconDir}/${item.filename}`),
      pending: true,
    });
  }

  savePending(settings, remaining);
  return {
    ...snapshot,
    icons: [...extras, ...snapshot.icons],
  };
}

function saveCachedCatalog(
  settings: IconLibrarySettings,
  snapshot: CatalogSnapshot,
): void {
  const envelope: CachedCatalogEnvelope = {
    repoKey: repoStorageKey(settings),
    snapshot,
  };
  Storage.set(cacheKey(settings), envelope);
}

export function loadCachedCatalog(
  settings: IconLibrarySettings,
): CatalogSnapshot | null {
  if (!isLibraryReady(settings)) {
    return null;
  }
  try {
    const envelope = Storage.get<CachedCatalogEnvelope | CatalogSnapshot>(
      cacheKey(settings),
    );
    if (!envelope || typeof envelope !== "object") {
      return null;
    }
    if ("repoKey" in envelope && "snapshot" in envelope) {
      if (envelope.repoKey !== repoStorageKey(settings)) {
        return null;
      }
      return mergePending(envelope.snapshot, settings);
    }
    return mergePending(envelope as CatalogSnapshot, settings);
  } catch {
    return null;
  }
}

async function loadDirectorySnapshot(
  context: RepoContext,
): Promise<CatalogSnapshot | null> {
  const { settings } = context;
  const entries = await listPath(context, settings.iconDir);
  if (entries == null) {
    return snapshotFromDirectory(settings, []);
  }
  return snapshotFromDirectory(
    settings,
    entries
      .filter((item) => item.type === "file")
      .map((item) => ({ name: item.name, sha: item.sha })),
  );
}

export async function loadCatalog(
  context: RepoContext,
): Promise<CatalogSnapshot> {
  const { settings } = context;
  if (!isLibraryReady(settings)) {
    throw new Error("尚未完成图标库配置");
  }

  // 浏览只列目录，避免再打 raw JSON（易 429/超时把刷新拖很慢）。
  const directory = await loadDirectorySnapshot(context);
  const merged = directory ?? snapshotFromDirectory(settings, []);
  saveCachedCatalog(settings, merged);
  return mergePending(merged, settings);
}

export function findIconByFilename(
  snapshot: CatalogSnapshot,
  filename: string,
): CatalogIcon | undefined {
  return snapshot.icons.find(
    (item) => item.filename.toLowerCase() === filename.toLowerCase(),
  );
}

export function countPendingIcons(snapshot: CatalogSnapshot | null): number {
  if (!snapshot) return 0;
  return snapshot.icons.filter((item) => item.pending).length;
}
