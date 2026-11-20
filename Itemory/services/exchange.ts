import { assertImageDimensions } from "./image-dimensions";
import { Path } from "scripting";
import {
  parseExchange,
  parseExchangeText,
  type ExchangeIcon,
} from "./exchange-format";
import {
  buildExchangePlan,
  readExchangeSnapshot,
  type ExchangeAsset,
} from "./exchange-database";
import { inspectExchangeZip, crc32, ZIP_LIMIT } from "./exchange-zip";
import { buildImportGuide, EXCHANGE_README } from "./exchange-template";
import { getDatabase } from "./db";
import { coordinateMutation } from "./mutation-coordinator";
import {
  executeMutationBatch,
  findReceipt,
  hashMutationPayload,
  type MutationContext,
} from "./mutation";
import { getPendingState } from "./pending-state";
import { COVERS_DIR, ROOT_DIR, coverFilePath, ensureDataDirectories } from "./paths";
import { notifyDataChanged } from "./change-store";
import { invalidateCoverValidation } from "./covers";
import {
  MAX_COVER_BYTES,
  coverBytesFrom,
  isCoverAssetId,
  retireCoverReplicaForAsset,
  readAssetBlob,
  readCoverFileBytes,
  type CoverBytes,
} from "./asset-blob-store";

const journalDir = () => Path.join(ROOT_DIR, "exchange-journals");
let running = false;
async function cleanup(path: string): Promise<void> {
  try {
    if (await FileManager.exists(path)) await FileManager.remove(path);
  } catch {
    /* Temporary cleanup is not commit truth. */
  }
}
async function boundedFile(path: string, limit: number): Promise<void> {
  if ((await FileManager.isLink(path)) || !(await FileManager.isFile(path)))
    throw new Error("只接受普通文件");
  const stat = await FileManager.stat(path);
  if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > limit)
    throw new Error(`文件超过限制 ${Math.round(limit / 1024 / 1024)} MiB`);
}
async function flow(work: (temp: string) => Promise<void>): Promise<void> {
  if (running) return;
  running = true;
  const temp = Path.join(
    FileManager.temporaryDirectory,
    `itemory-exchange-${UUID.string()}`,
  );
  try {
    await FileManager.createDirectory(temp, true);
    await work(temp);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const report = Path.join(temp, "Itemory-Import-Errors.txt");
    await FileManager.writeAsString(
      report,
      `Itemory 数据交换未完成\n${message}\n\n不要盲目重复导入；若提示结果待核对，请先返回待决操作核对。\n`,
    );
    const share = await Dialog.confirm({
      title: "数据交换未完成",
      message: message.slice(0, 1800),
      confirmLabel: "导出错误报告",
      cancelLabel: "关闭",
    });
    if (share) await ShareSheet.present([report]);
  } finally {
    await cleanup(temp);
    running = false;
  }
}
async function sharePackage(
  temp: string,
  payload: string,
  prefix: string,
): Promise<void> {
  const file = Path.join(temp, `${prefix}-${Date.now()}.zip`);
  await FileManager.zip(payload, file, false);
  // Ensure our exported packages meet exactly the importer's safety contract.
  await boundedFile(file, ZIP_LIMIT);
  inspectExchangeZip(await FileManager.readAsBytes(file));
  await ShareSheet.present([file]);
}
/**
 * 导出读字节的唯一边界：`asset_blobs` 是唯一权威来源，导出的永远是库里的那一份。
 * 没有登记行、或登记字节未通过复核，都拒绝导出不完整的数据包——不再回落到
 * `covers/<asset id>.png` 历史文件。
 */
async function readExportCover(
  db: SQLite.Database,
  assetId: string,
  label: string,
): Promise<CoverBytes> {
  if (!isCoverAssetId(assetId))
    throw new Error(`物品「${label}」的封面引用无效，未导出不完整数据包`);
  const blob = await readAssetBlob(db, assetId);
  if (blob) return blob;
  const rows = await db.fetchAll<{ n: number }>(
    "SELECT 1 AS n FROM asset_blobs WHERE asset_id = ?",
    [assetId],
  );
  if (rows.length > 0)
    throw new Error(
      `物品「${label}」的封面字节未能通过校验，未导出不完整数据包；请稍后重试`,
    );
  throw new Error(`物品「${label}」的封面缺失，未导出不完整数据包`);
}

export async function exportExchangeData(): Promise<void> {
  await flow(async (temp) => {
    const payload = Path.join(temp, "payload");
    await FileManager.createDirectory(Path.join(payload, "images"), true);
    await coordinateMutation(async () => {
      const db = await getDatabase();
      const data = await readExchangeSnapshot(db);
      const copied = new Set<string>();
      for (const item of data.items)
        if (item.cover && !copied.has(item.cover)) {
          const assetId = item.cover.slice("images/".length);
          const blob = await readExportCover(db, assetId, item.name);
          const target = Path.join(payload, item.cover);
          // 写出的就是权威字节：长度与摘要已在读取时复核，这里再确认落盘长度
          // 与可解码性，避免把不完整的图片放进数据包。
          await FileManager.writeAsData(target, blob.data);
          const written = await FileManager.stat(target);
          if (
            !Number.isSafeInteger(written.size) ||
            written.size !== blob.byteSize ||
            !UIImage.fromFile(target)
          )
            throw new Error(
              `物品「${item.name}」的封面缺失或损坏，未导出不完整数据包`,
            );
          copied.add(item.cover);
        }
      const json = JSON.stringify(data, null, 2);
      parseExchangeText(json);
      await FileManager.writeAsString(Path.join(payload, "data.json"), json);
      await FileManager.writeAsString(
        Path.join(payload, "README.md"),
        EXCHANGE_README,
      );
    });
    await sharePackage(temp, payload, "Itemory-Data");
  });
}
export async function exportExchangeTemplate(): Promise<void> {
  await flow(async (temp) => {
    const guide = Path.join(temp, "Itemory-AI转换指令.md");
    await FileManager.writeAsString(guide, buildImportGuide());
    await ShareSheet.present([guide]);
  });
}
interface Journal {
  command: MutationContext;
  files: string[];
}
async function saveJournal(journal: Journal): Promise<string> {
  await FileManager.createDirectory(journalDir(), true);
  const target = Path.join(journalDir(), `${journal.command.commandId}.json`);
  const next = target + ".next";
  await FileManager.writeAsString(next, JSON.stringify(journal));
  await FileManager.rename(next, target);
  return target;
}
// On a restart, uncommitted files are never silently removed. A database receipt
// proves commit; missing receipt + user confirmation permits cleanup of this batch only.
async function reconcileExchangeFiles(db: SQLite.Database): Promise<void> {
  if (!(await FileManager.exists(journalDir()))) return;
  const state = getPendingState();
  if (
    state.unresolvedCount ||
    state.corruptCount ||
    state.runningCount ||
    state.lastError
  )
    throw new Error("请先完成待决操作核对，再导入数据");
  for (const entry of await FileManager.readDirectory(journalDir())) {
    const name = entry.slice(entry.lastIndexOf("/") + 1);
    if (!/^exchange-[a-f0-9]{64}\.json$/.test(name)) continue;
    const path = Path.join(journalDir(), name);
    await boundedFile(path, 2 * 1024 * 1024);
    const j = JSON.parse(await FileManager.readAsString(path)) as Journal;
    if (
      j.command?.commandId + ".json" !== name ||
      j.command.kind !== "data.import" ||
      !/^[a-f0-9]{64}$/.test(j.command.payloadHash) ||
      !Array.isArray(j.files) ||
      j.files.some((f) => typeof f !== "string" || !isCoverAssetId(f))
    )
      throw new Error("导入恢复日志损坏，已保留文件，请勿继续导入");
    if (await findReceipt(db, j.command)) {
      await cleanup(path);
      continue;
    }
    if (
      !(await Dialog.confirm({
        title: "发现未完成的导入",
        message:
          "数据库未记录该批次成功提交。是否清理这一批次尚未被物品引用的封面？现有物品不会删除。",
        confirmLabel: "清理并继续",
        cancelLabel: "取消",
      }))
    )
      throw new Error("未完成导入已保留");
    for (const filename of j.files) {
      const rows = await db.fetchAll<{ n: number }>(
        "SELECT COUNT(*) n FROM items WHERE cover_asset_id=?",
        [filename],
      );
      if ((rows[0]?.n ?? 0) > 0) continue;
      const file = coverFilePath(filename);
      if (await FileManager.exists(file)) await FileManager.remove(file);
      // 与封面文件一起清掉本批可能残留的登记行（含 asset_blobs）。两个删除都
      // 重复引用守卫：绝不删除已被物品引用的资源。会话在提交时是原子的，
      // 这里只兜住“宿主分语句执行 + 中断”这种历史遗留状态。
      try {
        await db.execute(
          `DELETE FROM asset_blobs WHERE asset_id=? AND NOT EXISTS (SELECT 1 FROM items WHERE cover_asset_id=?);
DELETE FROM assets WHERE id=? AND NOT EXISTS (SELECT 1 FROM items WHERE cover_asset_id=?);`,
          [filename, filename, filename, filename],
        );
      } catch (error) {
        console.log(`[Exchange] ${filename} 残留登记行清理失败：${String(error)}`);
      }
    }
    await FileManager.remove(path);
  }
}
function nativeIcon(
  icon: ExchangeIcon | null,
  warnings: string[],
  label: string,
): ExchangeIcon | null {
  if (icon?.type === "sfSymbol" && !UIImage.fromSFSymbol(icon.value)) {
    warnings.push(`${label}：图标不可用，使用默认图标`);
    return null;
  }
  return icon;
}
/**
 * 提交后的廉价自检：用一次（分块）查询确认本批封面字节确实落库且类型/长度自洽。
 * 只写日志——物品、资源行与回执已经提交，自检失败绝不回滚也不上报失败；缺失的
 * 字节只能由用户重新选择封面或重新导入来修复（不再有启动回填）。
 */
async function reportImportedBlobStatus(
  db: SQLite.Database,
  assets: Map<string, ExchangeAsset>,
): Promise<void> {
  const expected = [...assets.values()]
    .filter((asset) => asset.blob !== null)
    .map((asset) => asset.filename);
  if (expected.length === 0) return;
  let stored = 0;
  try {
    const chunkSize = 200;
    for (let start = 0; start < expected.length; start += chunkSize) {
      const chunk = expected.slice(start, start + chunkSize);
      const rows = await db.fetchAll<{ n: number }>(
        `SELECT COUNT(*) AS n FROM asset_blobs WHERE asset_id IN (${chunk
          .map(() => "?")
          .join(",")}) AND typeof(png_bytes)='blob' AND length(png_bytes)=byte_size`,
        chunk,
      );
      stored += Number(rows[0]?.n ?? 0);
    }
  } catch (error) {
    console.log(`[Exchange] 封面字节自检失败：${String(error)}`);
    return;
  }
  if (stored !== expected.length)
    console.log(
      `[Exchange] ${expected.length - stored}/${expected.length} 个封面字节未落库，这些物品的封面会显示为缺失`,
    );
}

export async function importExchangeData(): Promise<void> {
  await flow(async (temp) => {
    const selected = (
      await DocumentPicker.pickFiles({
        types: ["public.zip-archive", "public.data"],
        allowsMultipleSelection: false,
      })
    )[0];
    if (!selected) return;
    const zip = Path.join(temp, "input.zip");
    try {
      await boundedFile(selected, ZIP_LIMIT);
      await FileManager.copyFile(selected, zip);
    } finally {
      DocumentPicker.stopAcessingSecurityScopedResources();
    }
    const members = inspectExchangeZip(await FileManager.readAsBytes(zip));
    const payload = Path.join(temp, "payload"),
      ready = Path.join(temp, "ready");
    await FileManager.createDirectory(payload, true);
    await FileManager.createDirectory(ready, true);
    await FileManager.unzip(zip, payload);
    for (const member of members)
      if (!member.name.endsWith("/")) {
        const path = Path.join(payload, member.name);
        if (await FileManager.isLink(Path.join(payload, "images")))
          throw new Error("图片目录不能是链接");
        await boundedFile(path, MAX_COVER_BYTES);
        const bytes = await FileManager.readAsBytes(path);
        if (bytes.length !== member.size || crc32(bytes) !== member.crc)
          throw new Error(`文件校验失败：${member.name}`);
      }
    const data = parseExchangeText(
      await FileManager.readAsString(Path.join(payload, "data.json")),
    );
    const warnings: string[] = [],
      assets = new Map<string, ExchangeAsset>(),
      imageHashes: Record<string, string> = {};
    let convertedTotal = 0;
    for (const item of data.items) {
      if (!item.cover || assets.has(item.cover)) continue;
      if (!members.some((m) => m.name === item.cover))
        throw new Error(`物品「${item.name}」缺少图片：${item.cover}`);
      const source = Path.join(payload, item.cover);
      const raw = await FileManager.readAsData(source);
      imageHashes[item.cover] = Crypto.sha256(raw).toHexString();
      const encoded = raw.toUint8Array();
      if (!encoded) throw new Error("图片字节读取失败");
      assertImageDimensions(encoded);
      const image = UIImage.fromFile(source);
      if (!image || image.width * image.height > 24000000)
        throw new Error(`物品「${item.name}」图片无法解码或超过2400万像素`);
      const filename = `${UUID.string()}.png`,
        target = Path.join(ready, filename);
      // 安装到封面目录的字节同时也是要写入主库的权威字节：PNG 源直接沿用
      // 校验过的原字节，JPEG 源使用转换结果，保证文件与 asset_blobs 完全一致。
      let installed: Data;
      if (item.cover.endsWith(".png")) {
        await FileManager.copyFile(source, target);
        installed = raw;
      } else {
        const png = image.toPNGData();
        if (!png) throw new Error("JPEG 转 PNG 失败");
        await FileManager.writeAsData(target, png);
        installed = png;
      }
      await boundedFile(target, MAX_COVER_BYTES);
      const size = (await FileManager.stat(target)).size;
      if ((convertedTotal += size) > 256 * 1024 * 1024)
        throw new Error("转换后的图片总量超过256MiB");
      // fail-closed：字节必须可用且与刚安装的文件逐字节一致。此处仍在任何写入
      // 之前（saveJournal / 安装封面 / 执行 SQL 都在后面），所以抛错即整体取消，
      // 数据库与 covers 目录都不留痕迹。先按安装的字节计算，再回读文件核对。
      const candidate =
        coverBytesFrom(installed, MAX_COVER_BYTES) ??
        (await readCoverFileBytes(target, MAX_COVER_BYTES));
      if (!candidate || candidate.byteSize !== size)
        throw new Error(
          `物品「${item.name}」的封面字节缺失或与文件长度不一致，导入已取消（未写入任何数据）`,
        );
      assets.set(item.cover, { filename, size, blob: candidate });
    }
    const hash = hashMutationPayload({ data, imageHashes });
    const command: MutationContext = {
      commandId: `exchange-${hash}`,
      kind: "data.import",
      payloadHash: hash,
    };
    for (const item of data.items)
      item.icon = nativeIcon(item.icon, warnings, item.name);
    for (const c of data.catalogs.categories)
      c.icon = nativeIcon(c.icon, warnings, c.name);
    const unused = members.filter(
      (m) => /^images\/.+/.test(m.name) && !assets.has(m.name),
    ).length;
    if (unused) warnings.push(`${unused} 张未引用图片不会导入`);
    const db = await getDatabase();
    if (await findReceipt(db, command))
      throw new Error(
        "此数据内容与图片已经导入过，已阻止重复新增。修改内容后不保证自动识别重复，请勿仅修改ID重试。",
      );
    if (
      !data.items.length &&
      !data.catalogs.categories.length &&
      !data.catalogs.tags.length
    ) {
      await Dialog.alert({
        title: "没有可导入的数据",
        message: "这是空白模板，请先通过AI填入真实记录。",
      });
      return;
    }
    const existing = await db.fetchAll<{ name: string }>(
      "SELECT name FROM items",
    );
    const keys = new Set(
      existing.map((i) => i.name.trim().normalize("NFC").toLowerCase()),
    );
    const sameNames = data.items.filter((i) =>
      keys.has(i.name.toLowerCase()),
    ).length;
    const message = `新增 ${data.items.length} 件物品、${data.items.reduce((n, i) => n + i.moneyEntries.length, 0)} 笔流水、${data.items.filter((i) => i.exit).length} 条退出记录、${assets.size} 个封面文件。\n${sameNames ? `其中 ${sameNames} 件与现有物品同名，仍会新增，不会合并。\n` : ""}分类和标签按名称复用或新建，已有样式保持不变。\n不会覆盖现有物品。\n${warnings.slice(0, 12).join("\n")}${warnings.length > 12 ? `\n另有 ${warnings.length - 12} 条图标提示` : ""}`;
    if (
      !(await Dialog.confirm({
        title: "确认导入数据？",
        message,
        confirmLabel: "新增导入",
        cancelLabel: "取消",
      }))
    )
      return;
    await coordinateMutation(async () => {
      await ensureDataDirectories();
      await reconcileExchangeFiles(db);
      if (await findReceipt(db, command))
        throw new Error("数据已导入，未重复写入");
      const plan = buildExchangePlan(
        parseExchange(data),
        assets,
        command,
        Date.now(),
        () => UUID.string(),
      );
      // Persist ownership before installing any new cover. No file is removed when
      // SQL's result is unknown; receipt reconciliation is the commit authority.
      const journal = await saveJournal({
        command,
        files: [...assets.values()].map((a) => a.filename),
      });
      for (const a of assets.values())
        await FileManager.rename(
          Path.join(ready, a.filename),
          Path.join(COVERS_DIR, a.filename),
        );
      await executeMutationBatch(
        db,
        command,
        String(plan.itemCount),
        plan.sql,
        plan.args,
      );
      await cleanup(journal);
      await reportImportedBlobStatus(db, assets);
      // 导入的封面既然已在库里复核通过，就不再留下常驻副本；不一致的文件保留。
      for (const asset of assets.values()) {
        const assetId = asset.filename;
        if (!(await retireCoverReplicaForAsset(db, assetId)))
          console.log(`[Exchange] ${assetId} 封面副本保留（未通过复核）`);
      }
      invalidateCoverValidation();
      notifyDataChanged();
    });
    await Dialog.alert({
      title: "导入完成",
      message: `已新增 ${data.items.length} 件物品，原有物品保持不变。`,
    });
  });
}
