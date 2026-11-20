import { Path } from "scripting";

const DEFAULT_ROOT_DIR = Path.join(
  FileManager.appGroupDocumentsDirectory,
  "itemory",
);

export const DATA_HOME = DEFAULT_ROOT_DIR;
export let ROOT_DIR = DEFAULT_ROOT_DIR;
export let DB_PATH = Path.join(ROOT_DIR, "data.sqlite");
export let COVERS_DIR = Path.join(ROOT_DIR, "covers");
export let DRAFTS_DIR = Path.join(ROOT_DIR, "drafts");
export let PENDING_DIR = Path.join(ROOT_DIR, "pending");
export let PREFS_PATH = Path.join(ROOT_DIR, "prefs.json");

function assertSafeCoverFilename(filename: string): void {
  if (!/^[A-Za-z0-9-]+\.png$/.test(filename)) {
    throw new Error("封面文件名无效");
  }
}

export function coverFilePath(filename: string): string {
  assertSafeCoverFilename(filename);
  return Path.join(COVERS_DIR, filename);
}

/**
 * 显示缓存根目录的字面名（验收安装按这个名字清理临时缓存）。
 * 缓存永远放在宿主临时目录，绝不进入数据根：它不属于数据，不参与备份/交换/恢复，
 * 也未出现在 README 的数据布局里。
 */
export const COVER_CACHE_ROOT_NAME = "itemory-cover-cache";

/**
 * 数据根命名空间：缓存只属于固定的数据根，重启、更新与迁移都不共享文件。
 */
export function coverCacheNamespace(): string {
  const slash = ROOT_DIR.lastIndexOf("/");
  const base = slash >= 0 ? ROOT_DIR.slice(slash + 1) : ROOT_DIR;
  return base || "itemory";
}

export function coverCacheDirectory(): string {
  return Path.join(
    FileManager.temporaryDirectory,
    COVER_CACHE_ROOT_NAME,
    coverCacheNamespace(),
  );
}

/** UI 渲染用的临时封面路径：可随时删除，缺失时按需从 asset_blobs 重建。 */
export function coverCacheFilePath(filename: string): string {
  assertSafeCoverFilename(filename);
  return Path.join(coverCacheDirectory(), filename);
}

export function draftFilePath(filename: string): string {
  assertSafeCoverFilename(filename);
  return Path.join(DRAFTS_DIR, filename);
}

let pathsReady = false;
/** Data paths are fixed: no pointer file can redirect the live database. */
export async function initializeDataPaths(): Promise<void> {
  if (pathsReady) return;
  pathsReady = true;
}

export async function ensureDataDirectories(): Promise<void> {
  await initializeDataPaths();
  for (const directory of [ROOT_DIR, COVERS_DIR, DRAFTS_DIR, PENDING_DIR]) {
    if (!(await FileManager.exists(directory))) {
      await FileManager.createDirectory(directory, true);
    }
  }
}
