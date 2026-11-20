import { coverFilePath, draftFilePath, ensureDataDirectories } from "./paths";
import { ValidationCache } from "./validation-cache";
import { resolveCoverFile, type CoverFileResult } from "./asset-blob-store";

const coverValidationCache = new ValidationCache<CoverReferenceResult>(
  1024,
  (result) => result.status === "valid",
);
export function invalidateCoverValidation(filename?: string): void {
  if (filename === undefined) coverValidationCache.invalidate();
  else {
    try {
      coverValidationCache.invalidate(coverFilePath(filename));
    } catch {
      /* Invalid paths are never cached. */
    }
  }
}

async function imageFromPicker(
  result: PHPickerResult,
): Promise<UIImage | null> {
  const provider = result.itemProvider;
  if (provider.hasItemConforming("public.png")) {
    const pngData = await provider.loadData("public.png");
    const fromPng = pngData ? UIImage.fromData(pngData) : null;
    if (fromPng) return fromPng;
  }

  const originalPath = await result.imagePath();
  if (originalPath) {
    try {
      const fromFile = UIImage.fromFile(originalPath);
      if (await FileManager.exists(originalPath))
        await FileManager.remove(originalPath);
      if (fromFile) return fromFile;
    } catch {
      if (await FileManager.exists(originalPath))
        await FileManager.remove(originalPath);
    }
  }
  return result.uiImage();
}

export async function pickCoverImage(): Promise<UIImage | null> {
  const results = await Photos.pick({
    filter: PHPickerFilter.images(),
    limit: 1,
  });
  const first = results[0];
  return first ? imageFromPicker(first) : null;
}

export type CoverCleanupStatus = "removed" | "missing" | "failed" | "skipped";

export interface CoverCleanupResult {
  status: CoverCleanupStatus;
  warning?: string;
}

export interface CoverCleanupOperations {
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
}

const DEFAULT_COVER_CLEANUP_OPERATIONS: CoverCleanupOperations = {
  exists: (path) => FileManager.exists(path),
  remove: (path) => FileManager.remove(path),
};

export type CoverReferenceStatus = "valid" | "missing" | "corrupt" | "invalid";

export interface CoverReferenceResult {
  path: string | null;
  status: CoverReferenceStatus;
}

/** 读取库句柄；任何失败都退化为“只有派生副本”可用，绝不让渲染整体失败。 */
async function coverDatabase(): Promise<SQLite.Database | null> {
  try {
    const { getDatabase } = await import("./db");
    return await getDatabase();
  } catch (error) {
    console.log(`[Cover] database unavailable: ${String(error)}`);
    return null;
  }
}

/** 库内字节的解析结果就是显示判据：没有可复核字节一律不交给 UI。 */
function referenceFromCoverFile(
  result: CoverFileResult,
): CoverReferenceResult {
  switch (result.status) {
    case "present":
    case "restored":
      return { path: result.path, status: "valid" };
    case "invalid":
      return { path: null, status: "invalid" };
    case "corrupt":
      return { path: null, status: "corrupt" };
    default:
      return { path: null, status: "missing" };
  }
}

/**
 * Resolve the path the UI can render. `asset_blobs` is the only source: the
 * path is a disposable `cache/covers/<id>.png` entry that is (re)built from the
 * stored bytes when missing or drifted, so display never depends on a
 * permanent replica file. Header-only check (no full decode): covers are always
 * app-written PNGs. A file truncated after a valid header is not detected.
 */
export async function resolveCoverPath(
  filename: string | null | undefined,
  db?: SQLite.Database,
): Promise<CoverReferenceResult> {
  if (!filename) return { path: null, status: "missing" };

  let target: string;
  try {
    target = coverFilePath(filename);
  } catch {
    return { path: null, status: "invalid" };
  }

  const load = async () => {
    const file = await resolveCoverFile(db ?? (await coverDatabase()), filename);
    return referenceFromCoverFile(file);
  };
  const result = await coverValidationCache.resolve(target, load);
  // 显示缓存是可丢弃的（可能被淘汰或系统清理）：命中缓存也必须复核文件仍在，
  // 否则清掉这条缓存并按需重建，绝不把已失效的路径交给 UI。
  if (result.path) {
    let usable = true;
    try {
      if (typeof FileManager.exists === "function")
        usable = await FileManager.exists(result.path);
    } catch {
      usable = false;
    }
    if (!usable) {
      coverValidationCache.invalidate(target);
      return coverValidationCache.resolve(target, load);
    }
  }
  return result;
}

/** Write a picked cover only to the editor draft area. */
export async function saveDraftCoverImage(image: UIImage): Promise<string> {
  await ensureDataDirectories();
  const pngData = image.toPNGData();
  if (!pngData) throw new Error("无法生成封面图片数据");
  const filename = `${UUID.string()}.png`;
  await FileManager.writeAsData(draftFilePath(filename), pngData);
  return filename;
}

/** Move a draft into the formal cover area after the database command is ready to commit. */
export async function commitDraftCover(filename: string): Promise<string> {
  await ensureDataDirectories();
  const source = draftFilePath(filename);
  const target = coverFilePath(filename);
  if (!(await FileManager.exists(source)))
    throw new Error("封面草稿不存在，无法保存");
  invalidateCoverValidation(filename);
  try {
    await FileManager.rename(source, target);
  } finally {
    invalidateCoverValidation(filename);
  }
  return filename;
}

export async function cleanupDraftCover(
  filename: string | null | undefined,
  operations: CoverCleanupOperations = DEFAULT_COVER_CLEANUP_OPERATIONS,
): Promise<CoverCleanupResult> {
  if (!filename) return { status: "skipped" };
  try {
    const source = draftFilePath(filename);
    if (!(await operations.exists(source))) return { status: "missing" };
    await operations.remove(source);
    return { status: "removed" };
  } catch {
    // Cleanup failure is observable but must not change DB commit truth.
    return { status: "failed", warning: "封面草稿清理失败" };
  }
}

export async function rollbackCommittedCover(
  filename: string | null | undefined,
): Promise<CoverCleanupResult> {
  if (!filename) return { status: "skipped" };
  invalidateCoverValidation(filename);
  try {
    const source = coverFilePath(filename);
    const target = draftFilePath(filename);
    if (!(await FileManager.exists(source))) return { status: "missing" };
    if (await FileManager.exists(target)) {
      return { status: "failed", warning: "封面草稿恢复目标已存在" };
    }
    await FileManager.rename(source, target);
    return { status: "removed" };
  } catch {
    return { status: "failed", warning: "封面提交失败后无法恢复草稿" };
  } finally {
    invalidateCoverValidation(filename);
  }
}

export async function removeCoverPhoto(
  filename: string | null | undefined,
  operations: CoverCleanupOperations = DEFAULT_COVER_CLEANUP_OPERATIONS,
): Promise<CoverCleanupResult> {
  if (!filename) return { status: "skipped" };
  invalidateCoverValidation(filename);
  try {
    const target = coverFilePath(filename);
    if (!(await operations.exists(target))) return { status: "missing" };
    await operations.remove(target);
    return { status: "removed" };
  } catch {
    return { status: "failed", warning: "正式封面清理失败" };
  } finally {
    invalidateCoverValidation(filename);
  }
}

export async function removeUnreferencedCoverPhoto(
  db: SQLite.Database,
  filename: string | null | undefined,
  operations: CoverCleanupOperations = DEFAULT_COVER_CLEANUP_OPERATIONS,
): Promise<CoverCleanupResult> {
  if (!filename) return { status: "skipped" };
  try {
    const rows = await db.fetchAll<{ n: number }>(
      "SELECT COUNT(*) AS n FROM items WHERE cover_asset_id = ?",
      [filename],
    );
    if ((rows[0]?.n ?? 0) > 0) return { status: "skipped" };
    const result = await removeCoverPhoto(filename, operations);
    if (result.status === "removed" || result.status === "missing") {
      try {
        // One db.execute is the atomic boundary: the stored bytes and the
        // asset row disappear together, and both deletes repeat the reference
        // guard so a concurrent owner can never lose its cover.
        await db.execute(
          `DELETE FROM asset_blobs WHERE asset_id = ? AND NOT EXISTS (SELECT 1 FROM items WHERE cover_asset_id = ?);
DELETE FROM assets WHERE id = ? AND NOT EXISTS (SELECT 1 FROM items WHERE cover_asset_id = ?);`,
          [filename, filename, filename, filename],
        );
      } catch {
        return {
          status: result.status,
          warning: "封面文件已清理，但资源登记未能同步删除",
        };
      }
    }
    return result;
  } catch {
    return {
      status: "failed",
      warning: "无法确认封面引用状态，已跳过文件清理",
    };
  }
}

export interface DraftCoverSession {
  current: string | null;
  promoted: Set<string>;
  closed: boolean;
}
export function createDraftCoverSession(): DraftCoverSession {
  return { current: null, promoted: new Set(), closed: false };
}
export async function replaceDraftCover(
  session: DraftCoverSession,
  image: UIImage,
): Promise<string> {
  if (session.closed) throw new Error("封面编辑会话已关闭");
  const next = await saveDraftCoverImage(image);
  if (session.closed) {
    await cleanupDraftCover(next);
    throw new Error("封面编辑会话已关闭");
  }
  const previous = session.current;
  session.current = next;
  if (previous && previous !== next) {
    const cleanup = await cleanupDraftCover(previous);
    if (cleanup.status === "failed") return next;
  }
  return next;
}
export async function promoteDraftCover(
  session: DraftCoverSession,
): Promise<string | null> {
  const current = session.current;
  if (!current) return null;
  const promoted = await commitDraftCover(current);
  session.promoted.add(promoted);
  session.current = null;
  return promoted;
}
export async function closeDraftCoverSession(
  session: DraftCoverSession,
): Promise<CoverCleanupResult> {
  session.closed = true;
  const current = session.current;
  session.current = null;
  return cleanupDraftCover(current);
}
