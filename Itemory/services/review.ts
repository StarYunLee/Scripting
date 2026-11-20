import type { ExitReason } from "../models/types";
import { formatMinorMoney, formatYmdZh } from "./format";
import { getDatabase } from "./db";

export interface ReviewItem {
  id: string;
  name: string;
  acquiredOn: string;
  acquisitionAmountMinor: number | null;
  channel: string | null;
  iconSymbol: string;
  coverAssetId: string | null;
  exitReason: ExitReason | null;
  exitedOn: string | null;
  revision: number;
}

export interface ReviewQuery {
  year: string; // "all" or a four-digit calendar year
  direction: "asc" | "desc";
}

export interface ReviewQueryOptions extends Partial<ReviewQuery> {
  offset?: number;
  limit?: number;
}

export interface ReviewPageResult {
  items: ReviewItem[];
  years: string[];
  totalCount: number;
  hasMore: boolean;
}

type ReviewRow = {
  kind: "item" | "year" | "meta";
  id: string | null;
  name: string | null;
  acquired_on: string | null;
  icon_symbol: string | null;
  cover_asset_id: string | null;
  channel: string | null;
  exit_reason: ExitReason | null;
  exited_on: string | null;
  revision: number | null;
  acquisition_amount_minor: number | null;
  year: string | null;
  total: number | null;
};

export function normalizeReviewQuery(options: Partial<ReviewQuery>): ReviewQuery {
  const year = options.year ?? "all";
  if (year !== "all" && !/^\d{4}$/.test(year)) throw new Error("无效的购入年份");
  return { year, direction: options.direction === "asc" ? "asc" : "desc" };
}

function pageNumber(value: number | undefined, fallback: number, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.trunc(value!)) : fallback;
}

const EXIT_LABELS: Record<ExitReason, string> = {
  sold: "已出售", gifted: "已赠送", discarded: "已丢弃", lost: "已遗失",
};

/** A structured metadata line: price, acquisition channel, or exit status. */
export function reviewItemSubtitle(item: ReviewItem): string | null {
  if (item.exitReason && item.exitedOn) {
    const parts = [
      item.acquisitionAmountMinor !== null ? formatMinorMoney(item.acquisitionAmountMinor, true) : null,
      `于${formatYmdZh(item.exitedOn)}${EXIT_LABELS[item.exitReason]}`,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  const channel = item.channel?.trim() || null;
  const amount = item.acquisitionAmountMinor;
  if (amount === null) return channel;
  const money = formatMinorMoney(amount, true);
  return channel ? `${money} · ${channel}` : money;
}

/** One statement: the page, count, and year menu describe the same DB snapshot.
 * Includes every item state and the item's own acquisition/exit metadata only;
 * it deliberately does not load maintenance or other money-entry rows.
 */
export async function queryReviewPage(
  db: Pick<SQLite.Database, "fetchAll">,
  options: ReviewQueryOptions = {},
  isCurrent: () => boolean = () => true,
): Promise<ReviewPageResult> {
  const query = normalizeReviewQuery(options);
  const offset = pageNumber(options.offset, 0, 0);
  const limit = pageNumber(options.limit, 50, 1);
  const direction = query.direction === "asc" ? "ASC" : "DESC";
  const where = query.year === "all" ? "" : "WHERE substr(i.acquired_on,1,4)=?";
  const args: SQLite.DatabaseValue[] = query.year === "all" ? [] : [query.year];
  if (!isCurrent()) throw new Error("Review request superseded");
  const rows = await db.fetchAll<ReviewRow>(`WITH filtered AS (
    SELECT i.id,i.name,i.acquired_on,i.acquisition_amount_minor,i.channel,
      i.icon_symbol,i.cover_asset_id,i.revision,c.icon category_icon,
      x.reason exit_reason,x.exited_on
    FROM items i
    LEFT JOIN categories c ON c.id=i.category_id
    LEFT JOIN item_exits x ON x.item_id=i.id ${where}
  ), page AS (
    SELECT * FROM filtered ORDER BY acquired_on ${direction},id ASC LIMIT ? OFFSET ?
  ), snapshot AS (
    SELECT 'meta' kind,NULL id,NULL name,NULL acquired_on,NULL icon_symbol,
      NULL cover_asset_id,NULL channel,NULL exit_reason,NULL exited_on,
      NULL revision,NULL acquisition_amount_minor,NULL year,COUNT(*) total FROM filtered
    UNION ALL
    SELECT 'year',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      substr(acquired_on,1,4),NULL FROM items GROUP BY substr(acquired_on,1,4)
    UNION ALL
    SELECT 'item',id,name,acquired_on,
      COALESCE(NULLIF(icon_symbol,''),category_icon,'shippingbox.fill'),cover_asset_id,
      channel,exit_reason,exited_on,revision,acquisition_amount_minor,NULL,NULL FROM page
  ) SELECT * FROM snapshot ORDER BY kind ASC,acquired_on ${direction},id ASC`, [...args, limit, offset]);
  if (!isCurrent()) throw new Error("Review request superseded");
  const items = rows.filter(row => row.kind === "item").map(row => ({
    id: row.id!, name: row.name!, acquiredOn: row.acquired_on!,
    acquisitionAmountMinor: row.acquisition_amount_minor, channel: row.channel,
    iconSymbol: row.icon_symbol ?? "shippingbox.fill", coverAssetId: row.cover_asset_id,
    exitReason: row.exit_reason, exitedOn: row.exited_on, revision: row.revision ?? 0,
  }));
  const years = rows.filter(row => row.kind === "year" && /^\d{4}$/.test(row.year ?? ""))
    .map(row => row.year!).sort().reverse();
  const totalCount = rows.find(row => row.kind === "meta")?.total ?? 0;
  return { items, years, totalCount, hasMore: offset + items.length < totalCount };
}

export async function getReviewPage(
  options: ReviewQueryOptions = {},
  isCurrent: () => boolean = () => true,
): Promise<ReviewPageResult> {
  return queryReviewPage(await getDatabase(), options, isCurrent);
}

export interface ReviewTimelineRow {
  item: ReviewItem;
  startsDay: boolean;
  endsDay: boolean;
}

/** Same-day grouping is recomputed after append so a page boundary stays seamless. */
export function buildReviewRows(items: readonly ReviewItem[]): ReviewTimelineRow[] {
  return items.map((item, index) => ({
    item,
    startsDay: index === 0 || items[index - 1].acquiredOn !== item.acquiredOn,
    endsDay: index === items.length - 1 || items[index + 1].acquiredOn !== item.acquiredOn,
  }));
}
