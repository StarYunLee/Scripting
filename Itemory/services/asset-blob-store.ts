/**
 * 主库封面字节存储（asset_blobs）。
 *
 * 数据不变式（写入侧一律 fail-closed）：
 * - `asset_blobs` 是封面字节的唯一权威来源；`covers/<asset_id>` 只承载“草稿提升为正式
 *   封面”的那一次落盘，显示改由可丢弃的 `cache/covers` 缓存承担。
 * - 资源标识即内容且不可变：asset id 由 UUID 生成、从不复用；同一 id 永远对应同一张图。
 *   写入只插入不覆盖，若同 id 已有不同内容则整条业务语句回滚（不会悄悄换图）。
 * - 行内三列必须自洽：`byte_size` 等于字节长度、`sha256` 等于字节的 SHA-256。
 *   读取端每次都复核，任何不一致都按“没有这份字节”处理，绝不把不可信字节交给 UI。
 * - 显示缓存只有在与库内摘要一致时才算可用；不一致时以库为准重建，重建失败即 fail-closed。
 * - 写入与物品行共用同一条 `db.execute`：`asset_blobs` 未真正落库时物品事务回滚，
 *   不存在“物品引用了没有字节的封面”的静默引用。
 *
 * 外部接口（供备份/交换等未授权修改的模块对接）：
 * - `resolveCoverFile(db, assetId)`：解析可显示的封面路径；库里没有行就是 `missing`，
 *   字节未通过复核就是 `corrupt`，绝不回落到 `covers/<id>.png` 文件。
 * - `loadCoverBytesForWrite(db, assetId)`：命令层取字节的唯一入口，取不到即抛错。
 * - `appendAssetBlobRegistration(...)`：把字节写进同一条原子语句并自带落库断言。
 */
import { Path } from "scripting";
import {
  DRAFTS_DIR,
  coverCacheDirectory,
  coverCacheFilePath,
  coverFilePath,
  ensureDataDirectories,
} from "./paths";
import { assertImageDimensions } from "./image-dimensions";

export const ASSET_BLOB_TABLE = "asset_blobs";
export const ASSET_BLOB_COLUMNS = [
  "asset_id",
  "png_bytes",
  "byte_size",
  "sha256",
] as const;

/**
 * 结构声明。这里只保留 NOT NULL 与最小 CHECK（行内三列的自洽由代码与读回复核保证）：
 * 结构约束只用于让“写不进去”变成可检测的错误，绝不用来承载业务判据。
 */
export const ASSET_BLOB_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS asset_blobs (
  asset_id TEXT PRIMARY KEY,
  png_bytes BLOB NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  sha256 TEXT NOT NULL
);
`;

/** 与备份/交换一致的封面体积上限，超限一律视为不可用而不是截断。 */
export const MAX_COVER_BYTES = 32 * 1024 * 1024;
export const COVER_ASSET_ID_PATTERN = /^[A-Za-z0-9-]+\.png$/;

/** 封面字节写入失败的唯一错误标记，命令层据此区分“封面问题”和“并发冲突”。 */
export const COVER_BLOB_ERROR = "COVER_BLOB_UNAVAILABLE";

export interface CoverBytes {
  data: Data;
  byteSize: number;
  sha256: string;
}

export type CoverFileStatus =
  | "present"
  | "restored"
  | "missing"
  | "corrupt"
  | "invalid";

export interface CoverFileResult {
  path: string | null;
  status: CoverFileStatus;
}

export type StoredBlobStatus = "ok" | "absent" | "unusable";

export function isCoverAssetId(value: unknown): value is string {
  return typeof value === "string" && COVER_ASSET_ID_PATTERN.test(value);
}

function coverBlobError(message: string): Error {
  return new Error(`${COVER_BLOB_ERROR}：${message}`);
}

/** 只接受宿主声明的 blob 形态：Data，或可无损转换的 Uint8Array/ArrayBuffer。 */
function asData(value: unknown): Data | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const candidate = value as { toUint8Array?: unknown; size?: unknown };
    if (
      typeof candidate.toUint8Array === "function" &&
      typeof candidate.size === "number"
    )
      return value as Data;
    if (value instanceof Uint8Array) return Data.fromUint8Array(value);
    if (value instanceof ArrayBuffer) return Data.fromArrayBuffer(value);
    if (ArrayBuffer.isView(value))
      return Data.fromUint8Array(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      );
  }
  return null;
}

export function coverDigest(data: Data): string {
  return Crypto.sha256(data).toHexString().toLowerCase();
}

/** 非空、不超限、长度自洽、图片头可解析——写入与读取共用的唯一判据。 */
export function coverBytesFrom(
  data: Data | null | undefined,
  limitBytes: number = MAX_COVER_BYTES,
): CoverBytes | null {
  if (!data) return null;
  const byteSize = data.size;
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > limitBytes)
    return null;
  const bytes = data.toUint8Array();
  if (!bytes || bytes.length !== byteSize) return null;
  try {
    assertImageDimensions(bytes);
  } catch {
    return null;
  }
  return { data, byteSize, sha256: coverDigest(data) };
}

export async function readCoverFileBytes(
  path: string,
  limitBytes: number = MAX_COVER_BYTES,
): Promise<CoverBytes | null> {
  // stat is only a cheap early-out for oversized files; the limit is enforced
  // again on the bytes that were actually read.
  try {
    const size = Number((await FileManager.stat(path)).size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > limitBytes)
      return null;
  } catch {
    /* Hosts/doubles without stat fall through to the byte read. */
  }
  try {
    const bytes = await FileManager.readAsBytes(path);
    if (!bytes || bytes.length === 0 || bytes.length > limitBytes) return null;
    return coverBytesFrom(Data.fromUint8Array(bytes), limitBytes);
  } catch {
    return null;
  }
}

/** 读取 `covers/<id>.png` 的字节（草稿提升后刚落下的正式文件，只读）。 */
export async function readCoverFileBytesForAsset(
  assetId: string,
): Promise<CoverBytes | null> {
  if (!isCoverAssetId(assetId)) return null;
  let path: string;
  try {
    path = coverFilePath(assetId);
  } catch {
    return null;
  }
  return readCoverFileBytes(path);
}

interface BlobRowMeta {
  sha256: string;
  byteSize: number;
  declaredSize: number;
  kind: string;
  intact: boolean;
}

async function readBlobRowMeta(
  db: SQLite.Database,
  assetId: string,
): Promise<BlobRowMeta | null> {
  const rows = await db.fetchAll<{
    sha256: unknown;
    byte_size: unknown;
    size: unknown;
    kind: unknown;
  }>(
    "SELECT typeof(png_bytes) AS kind, length(png_bytes) AS size, byte_size, sha256 FROM asset_blobs WHERE asset_id = ?",
    [assetId],
  );
  const row = rows[0];
  if (!row) return null;
  const sha256 = typeof row.sha256 === "string" ? row.sha256.toLowerCase() : "";
  const byteSize = Number(row.byte_size);
  const declaredSize = Number(row.size);
  const kind = typeof row.kind === "string" ? row.kind : "";
  const intact =
    /^[0-9a-f]{64}$/.test(sha256) &&
    Number.isSafeInteger(byteSize) &&
    byteSize > 0 &&
    byteSize <= MAX_COVER_BYTES &&
    kind === "blob" &&
    declaredSize === byteSize;
  return { sha256, byteSize, declaredSize, kind, intact };
}

/** 读取并复核库内字节；任何一列不一致都返回 null（调用方按“没有字节”处理）。 */
export async function readAssetBlob(
  db: SQLite.Database,
  assetId: string,
): Promise<CoverBytes | null> {
  if (!isCoverAssetId(assetId)) return null;
  const meta = await readBlobRowMeta(db, assetId);
  if (!meta) return null;
  if (!meta.intact) {
    console.log(`[AssetBlob] ${assetId} 行内字段不自洽（${meta.kind}/${meta.declaredSize}/${meta.byteSize}），按缺失处理`);
    return null;
  }
  const rows = await db.fetchAll<{ png_bytes: unknown }>(
    "SELECT png_bytes FROM asset_blobs WHERE asset_id = ?",
    [assetId],
  );
  const data = asData(rows[0]?.png_bytes);
  if (!data) {
    console.log(`[AssetBlob] ${assetId} 字节类型不可用，按缺失处理`);
    return null;
  }
  if (data.size !== meta.byteSize) {
    console.log(`[AssetBlob] ${assetId} 长度与登记不一致，按缺失处理`);
    return null;
  }
  const sha256 = coverDigest(data);
  if (sha256 !== meta.sha256) {
    console.log(`[AssetBlob] ${assetId} 摘要不匹配，按缺失处理`);
    return null;
  }
  const bytes = data.toUint8Array();
  if (!bytes) return null;
  try {
    assertImageDimensions(bytes);
  } catch {
    console.log(`[AssetBlob] ${assetId} 字节不是可用图片，按缺失处理`);
    return null;
  }
  return { data, byteSize: data.size, sha256 };
}

/**
 * 命令层取字节的唯一入口：先读派生副本，缺失/损坏时读库。
 * 两条路都拿不到就抛错——绝不返回 null 让调用方“先写个资源行再说”。
 */
export async function loadCoverBytesForWrite(
  db: SQLite.Database,
  assetId: string | null | undefined,
): Promise<CoverBytes | null> {
  if (!assetId) return null;
  if (!isCoverAssetId(assetId)) throw coverBlobError("封面标识无效");
  const file = await readCoverFileBytesForAsset(assetId);
  const meta = await readBlobRowMeta(db, assetId);
  if (file) {
    // 同 id 已绑定别的字节：这是内容冲突，不能覆盖，也不能继续保存。
    if (meta && meta.sha256 !== file.sha256)
      throw coverBlobError("封面标识已被其他内容占用，请重新选择封面");
    return file;
  }
  const stored = await readAssetBlob(db, assetId);
  if (stored) return stored;
  throw coverBlobError("封面图片缺失或无法读取，本次保存已取消");
}

/**
 * 把字节并入物品命令的同一条原子语句，并自带两条断言：
 * 1. 只插入不覆盖（同 id 已有内容时插入被跳过）；
 * 2. 语句末尾断言“该 id 恰好存在一份与本次写入一致的 blob 行”，否则向 cas_check
 *    写入 0 触发 CHECK(ok = 1) 失败，宿主回滚整条 execute —— 物品行不会落库。
 */
export function appendAssetBlobRegistration(
  sql: string,
  args: SQLite.DatabaseValue[],
  assetId: string | null | undefined,
  blob: CoverBytes | null,
): { sql: string; args: SQLite.DatabaseValue[] } {
  if (!assetId || !blob) return { sql, args };
  if (!isCoverAssetId(assetId)) throw coverBlobError("封面标识无效");
  return {
    sql: `INSERT INTO asset_blobs(asset_id,png_bytes,byte_size,sha256)
  SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM asset_blobs WHERE asset_id = ?);
INSERT INTO cas_check(ok) SELECT 0 WHERE NOT EXISTS (
  SELECT 1 FROM asset_blobs
   WHERE asset_id = ? AND sha256 = ? AND byte_size = ?
     AND typeof(png_bytes) = 'blob' AND length(png_bytes) = ?);
${sql}`,
    args: [
      assetId,
      blob.data,
      blob.byteSize,
      blob.sha256,
      assetId,
      assetId,
      blob.sha256,
      blob.byteSize,
      blob.byteSize,
      ...args,
    ],
  };
}

/**
 * 写入后立即做的廉价自检：只读类型与长度，不搬动整段字节。
 * 失败时只删除“确实属于本次写入”的那一行：该封面按缺失显示，等待重新选择。
 */
export async function verifyStoredAssetBlob(
  db: SQLite.Database,
  assetId: string,
  expected: CoverBytes,
): Promise<StoredBlobStatus> {
  if (!isCoverAssetId(assetId)) return "unusable";
  const meta = await readBlobRowMeta(db, assetId);
  if (!meta) return "absent";
  if (
    meta.intact &&
    meta.sha256 === expected.sha256 &&
    meta.byteSize === expected.byteSize
  )
    return "ok";
  console.log(
    `[AssetBlob] ${assetId} 落库自检未通过（${meta.kind}/${meta.declaredSize}/${meta.sha256.slice(0, 12)}）`,
  );
  if (meta.sha256 === expected.sha256) {
    try {
      await db.execute(
        "DELETE FROM asset_blobs WHERE asset_id = ? AND sha256 = ?",
        [assetId, meta.sha256],
      );
    } catch {
      /* 清理失败只会让下一次保存重新自检一次，不影响业务提交。 */
    }
  }
  return "unusable";
}

async function removeQuietly(path: string): Promise<void> {
  try {
    if (await FileManager.exists(path)) await FileManager.remove(path);
  } catch {
    /* 残留草稿不会被当作封面，也不参与备份。 */
  }
}

async function safeLink(path: string): Promise<boolean> {
  try {
    return await FileManager.isLink(path);
  } catch {
    return false;
  }
}

/**
 * 用库内字节重建“显示缓存”。写的是 `cache/covers/<id>.png`（可随时丢弃、不进备份/
 * 交换/恢复），临时文件仍先落在 drafts 并复核摘要，再改名进缓存目录：
 * 崩溃只会留下草稿（恢复流程整体清空 drafts），缓存目录里绝不会出现半个文件。
 * `covers/<id>.png` 只承载草稿提升时落下的那一份文件，不再作为显示来源。
 */
let cachePurged: Promise<void> | null = null;
/** 单次运行可占用的缓存预算：超出后按最旧优先淘汰，临时目录不会被无限撑大。 */
const CACHE_MAX_FILES = 128;
const CACHE_MAX_BYTES = 64 * 1024 * 1024;

interface CacheEntry {
  path: string;
  size: number;
  modified: number;
}

async function listCoverCache(): Promise<CacheEntry[]> {
  const entries: CacheEntry[] = [];
  let directory: string;
  try {
    directory = coverCacheDirectory();
  } catch {
    return entries;
  }
  try {
    if (!(await FileManager.exists(directory))) return entries;
    if (await safeLink(directory)) return entries;
    for (const name of await FileManager.readDirectory(directory)) {
      if (!COVER_ASSET_ID_PATTERN.test(name)) continue;
      const path = Path.join(directory, name);
      try {
        if (await safeLink(path)) continue;
        const stat = await FileManager.stat(path);
        const modified = Number(stat?.modificationDate);
        entries.push({
          path,
          size: Number(stat?.size) || 0,
          modified: Number.isFinite(modified) ? modified : 0,
        });
      } catch {
        /* 读不到 stat 的条目留给下一次。 */
      }
    }
  } catch {
    /* 缓存目录不可读时按空处理。 */
  }
  return entries;
}

/** 每个进程第一次写缓存前清空上一次运行留下的文件（只删规范命名的普通 PNG）。 */
async function purgeCoverCacheOnce(): Promise<void> {
  if (cachePurged) return cachePurged;
  cachePurged = (async () => {
    for (const entry of await listCoverCache()) await removeQuietly(entry.path);
  })();
  return cachePurged;
}

/**
 * 删除并复核“确实不在了”：只有删除后确认路径不存在才返回 true。
 * 宿主可能先 unlink 再报错（抛错但文件已消失），那同样算释放；
 * 删除后文件仍在（权限/占用/删除失败）则算未释放。无法确认时按仍占用处理。
 */
async function removeConfirmed(path: string): Promise<boolean> {
  await removeQuietly(path);
  try {
    return !(await FileManager.exists(path));
  } catch {
    return false;
  }
}

/** 存在性探测：宿主抛错时按“不存在”处理，调用方据此 fail-closed。 */
async function filePresent(path: string): Promise<boolean> {
  try {
    return await FileManager.exists(path);
  } catch {
    return false;
  }
}

/**
 * 有界淘汰：超出条数或字节预算时从最旧删起。
 * - 只有“删除后确认不存在”的条目才从 files/bytes 里扣除：删除抛错但文件已消失算释放，
 *   删除后文件仍在则保留计数并继续尝试下一个候选，避免虚报释放后提前收手。
 * - `protectedPath` 是本次刚写入、马上要交回调用方的文件：它永不参与淘汰——哪怕它就是
 *   最旧的一个（宿主 mtime 精度/时钟回拨），也宁可暂时超出预算，也不能返回失效路径。
 * - 候选取自一次目录快照，每个候选至多尝试一次，删除尝试次数因此有界。
 */
async function evictCoverCache(protectedPath?: string | null): Promise<void> {
  const entries = await listCoverCache();
  let files = entries.length;
  let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (files <= CACHE_MAX_FILES && bytes <= CACHE_MAX_BYTES) return;
  entries.sort(
    (a, b) =>
      a.modified - b.modified ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  for (const entry of entries) {
    if (files <= CACHE_MAX_FILES && bytes <= CACHE_MAX_BYTES) break;
    if (protectedPath && entry.path === protectedPath) continue;
    if (!(await removeConfirmed(entry.path))) continue;
    files--;
    bytes -= entry.size;
  }
}

export async function materializeCoverFile(
  assetId: string,
  blob: CoverBytes,
): Promise<string | null> {
  if (!isCoverAssetId(assetId)) return null;
  let target: string;
  let temporary: string;
  try {
    target = coverCacheFilePath(assetId);
    temporary = Path.join(DRAFTS_DIR, `${UUID.string()}.png`);
  } catch {
    return null;
  }
  try {
    await ensureDataDirectories();
    await FileManager.createDirectory(coverCacheDirectory(), true);
    await purgeCoverCacheOnce();
    if (await safeLink(target)) {
      console.log(`[AssetBlob] ${assetId} 缓存目标为符号链接，已跳过重建`);
      return null;
    }
    await FileManager.writeAsData(temporary, blob.data);
    const written = await readCoverFileBytes(temporary);
    if (!written || written.sha256 !== blob.sha256) {
      await removeQuietly(temporary);
      console.log(`[AssetBlob] ${assetId} 显示缓存复核失败`);
      return null;
    }
    await FileManager.rename(temporary, target);
    // 传 target 作保护：本次刚写入的文件不能被即将执行的淘汰删掉，
    // 否则调用方会拿到一条已经失效的显示路径。
    await evictCoverCache(target);
    if (!(await filePresent(target))) {
      console.log(`[AssetBlob] ${assetId} 显示缓存写入后已失效，按不可用处理`);
      return null;
    }
    return target;
  } catch (error) {
    await removeQuietly(temporary);
    console.log(`[AssetBlob] ${assetId} 显示缓存写入失败：${String(error)}`);
    return null;
  }
}

/** 显示缓存是否已存在且与库内摘要一致（不存在即按需重建）。 */
async function verifiedCoverCachePath(
  assetId: string,
  blob: CoverBytes,
): Promise<string | null> {
  try {
    const target = coverCacheFilePath(assetId);
    if (!(await FileManager.exists(target))) return null;
    if (await safeLink(target)) return null;
    const cached = await readCoverFileBytes(target);
    if (cached && cached.sha256 === blob.sha256 && cached.byteSize === blob.byteSize)
      return target;
    await removeQuietly(target);
    return null;
  } catch {
    return null;
  }
}

/**
 * 导出/渲染共用入口：解析可显示、可复核的封面路径。
 * `asset_blobs` 是唯一权威：有行且字节通过复核时，路径来自可丢弃的 `cache/covers`
 * 显示缓存（命中即复用，缺失或漂移时用库里字节重建）。
 * 库里没有这一行就是 `missing`，字节没通过复核就是 `corrupt`：不再回落到
 * `covers/<id>.png` 历史文件，重建失败也不伪造路径。
 */
export async function resolveCoverFile(
  db: SQLite.Database | null,
  assetId: string | null | undefined,
): Promise<CoverFileResult> {
  if (!assetId) return { path: null, status: "missing" };
  if (!isCoverAssetId(assetId)) return { path: null, status: "invalid" };
  const meta = db ? await readBlobRowMeta(db, assetId) : null;
  // 没有登记行或读不到库句柄：没有可核验的权威字节，一律按缺失处理。
  if (!db || !meta) return { path: null, status: "missing" };
  const blob = await readAssetBlob(db, assetId);
  if (!blob) return { path: null, status: "corrupt" };
  const cached = await verifiedCoverCachePath(assetId, blob);
  if (cached) return { path: cached, status: "present" };
  const built = await materializeCoverFile(assetId, blob);
  return built
    ? { path: built, status: "restored" }
    : { path: null, status: "corrupt" };
}

/**
 * 导入/恢复后收尾：这条资源的字节已经在库里复核通过时，删除刚刚安装的
 * `covers/<id>.png` 副本（内容必须完全一致才会删，否则保留并报告）。
 * 用于让“新导入的封面”也不再留下常驻副本。
 */
export async function retireCoverReplicaForAsset(
  db: SQLite.Database,
  assetId: string,
): Promise<boolean> {
  if (!isCoverAssetId(assetId)) return false;
  let path: string;
  try {
    path = coverFilePath(assetId);
  } catch {
    return false;
  }
  try {
    if (!(await FileManager.exists(path))) return true;
    if (await safeLink(path)) return false;
  } catch {
    return false;
  }
  const blob = await readAssetBlob(db, assetId);
  if (!blob) return false;
  const file = await readCoverFileBytes(path);
  if (!file || file.sha256 !== blob.sha256 || file.byteSize !== blob.byteSize)
    return false;
  try {
    await FileManager.remove(path);
  } catch {
    return false;
  }
  if (await FileManager.exists(path)) return false;
  // 调用方负责让封面解析缓存失效（covers.ts 依赖本模块，此处不反向引用）。
  return true;
}

/**
 * 确认显示缓存可用（导出/UI 共用）。缓存已在磁盘且摘要一致时不重建；
 * 缺失或漂移时用库内字节重建，重建失败即 fail-closed（返回 missing/corrupt）。
 * 库里没有这份字节时同样返回 missing：不创建、不读取任何常驻副本文件。
 */
export async function ensureCoverReplica(
  db: SQLite.Database,
  assetId: string,
): Promise<CoverFileResult> {
  const result = await resolveCoverFile(db, assetId);
  if (result.status === "missing" || result.status === "invalid")
    console.log(`[AssetBlob] ${assetId} 无法提供显示封面（${result.status}）`);
  return result;
}
