import type {
  ExitReason,
  ItemCondition,
  MoneyDirection,
  MoneyEntryKind,
} from "../models/types";
import {
  assertBusinessDate,
  assertSafeMinor,
  normalizeEntityName,
  safeAddMinor,
} from "../domain/validation";
import {
  ITEMORY_ICON_VALUE_MAX_LENGTH,
  ITEMORY_NAME_MAX_LENGTH,
  ITEMORY_TEXT_MAX_LENGTH,
  describeItemoryTextIssue,
} from "../domain/text-limits";

export type ExchangeIcon = { type: "emoji" | "sfSymbol"; value: string };
export interface ExchangeMoney {
  id: string;
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  amountMinor: number;
  occurredOn: string;
  title: string;
  note: string | null;
}
export interface ExchangeExit {
  reason: ExitReason;
  exitedOn: string;
  recoveryAmountMinor: number | null;
  note: string | null;
}
export interface ExchangeItem {
  id: string;
  name: string;
  acquiredOn: string;
  holdingCondition: ItemCondition;
  acquisitionAmountMinor: number | null;
  category: string | null;
  tags: string[];
  channel: string | null;
  warrantyUntil: string | null;
  valuationMinor: number | null;
  notes: string | null;
  icon: ExchangeIcon | null;
  cover: string | null;
  moneyEntries: ExchangeMoney[];
  exit: ExchangeExit | null;
}
export interface ExchangeCategory {
  name: string;
  icon: ExchangeIcon | null;
  sortOrder: number;
}
export interface ExchangeTag {
  name: string;
  color: string;
  sortOrder: number;
}
export interface ExchangeData {
  format: "itemory-data";
  version: 1;
  currency: "CNY";
  items: ExchangeItem[];
  catalogs: { categories: ExchangeCategory[]; tags: ExchangeTag[] };
}
// Shared declaration drives both runtime structural validation and downloadable JSON Schema.
type Rule = {
  type?: string;
  properties?: Record<string, Rule>;
  required?: string[];
  items?: Rule;
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  anyOf?: Rule[];
  additionalProperties?: boolean;
};
const text: Rule = { type: "string", maxLength: ITEMORY_TEXT_MAX_LENGTH };
const name: Rule = {
  type: "string",
  minLength: 1,
  maxLength: ITEMORY_NAME_MAX_LENGTH,
};
const id: Rule = { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" };
const date: Rule = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const money: Rule = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
};
const nullable = (r: Rule): Rule => ({ anyOf: [r, { type: "null" }] });
const array = (items: Rule, maxItems = 5000): Rule => ({
  type: "array",
  items,
  maxItems,
});
const object = (
  properties: Record<string, Rule>,
  required: string[] = [],
): Rule => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const oneOf = (...values: string[]): Rule => ({ type: "string", enum: values });
const icon = object(
  { type: oneOf("emoji", "sfSymbol"), value: { ...name, maxLength: ITEMORY_ICON_VALUE_MAX_LENGTH } },
  ["type", "value"],
);
const entry = object(
  {
    id,
    direction: oneOf("expense", "income"),
    kind: oneOf("accessory", "maintenance", "repair", "upgrade", "other"),
    amountMinor: { ...money, minimum: 1 },
    occurredOn: date,
    title: name,
    note: nullable(text),
  },
  ["id", "direction", "kind", "amountMinor", "occurredOn", "title"],
);
const exit = object(
  {
    reason: oneOf("sold", "gifted", "discarded", "lost"),
    exitedOn: date,
    recoveryAmountMinor: nullable(money),
    note: nullable(text),
  },
  ["reason", "exitedOn"],
);
const item = object(
  {
    id,
    name,
    acquiredOn: date,
    holdingCondition: oneOf("in_use", "idle", "damaged"),
    acquisitionAmountMinor: nullable(money),
    category: nullable(name),
    tags: array(name, 200),
    channel: nullable(text),
    warrantyUntil: nullable(date),
    valuationMinor: nullable(money),
    notes: nullable(text),
    icon: nullable(icon),
    cover: nullable({
      type: "string",
      pattern: "^images/[A-Za-z0-9_-]{1,128}\\.(png|jpg|jpeg)$",
    }),
    moneyEntries: array(entry),
    exit: nullable(exit),
  },
  ["id", "name", "acquiredOn", "holdingCondition"],
);
const order: Rule = { type: "integer", minimum: 0, maximum: 1000000 };
export const EXCHANGE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Itemory data exchange v1",
  ...object(
    {
      format: { const: "itemory-data" },
      version: { const: 1 },
      currency: { const: "CNY" },
      items: array(item),
      catalogs: object({
        categories: array(
          object({ name, icon: nullable(icon), sortOrder: order }, ["name"]),
        ),
        tags: array(
          object(
            {
              name,
              color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              sortOrder: order,
            },
            ["name"],
          ),
        ),
      }),
    },
    ["format", "version", "currency", "items"],
  ),
};
function check(v: unknown, r: Rule, p: string): void {
  const fail = (why: string): never => {
    throw new Error(`${p}: ${why}`);
  };
  if (r.anyOf) {
    if (v === null) return;
    return check(v, r.anyOf[0], p);
  }
  if (r.const !== undefined && v !== r.const)
    fail(`必须为 ${JSON.stringify(r.const)}`);
  if (r.enum && !r.enum.includes(v)) fail(`仅允许 ${r.enum.join(" / ")}`);
  if (r.type === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) fail("必须为对象");
    const o = v as Record<string, unknown>;
    for (const k of r.required ?? [])
      if (!Object.prototype.hasOwnProperty.call(o, k))
        fail(`缺少必填字段 ${k}`);
    for (const k of Object.keys(o)) {
      if (!Object.prototype.hasOwnProperty.call(r.properties, k))
        fail(`未知字段 ${k}`);
      check(o[k], r.properties![k], `${p}.${k}`);
    }
  } else if (r.type === "array") {
    if (!Array.isArray(v)) fail("必须为数组");
    const a = v as unknown[];
    if (a.length > r.maxItems!) fail(`最多 ${r.maxItems} 项`);
    a.forEach((x, i) => check(x, r.items!, `${p}[${i}]`));
  } else if (r.type === "string") {
    if (typeof v !== "string") fail("必须为字符串");
    const s = v as string;
    if (r.minLength && s.trim().length < r.minLength) fail("文本不能为空");
    if (r.maxLength && s.length > r.maxLength)
      fail(`文本超过 ${r.maxLength} 个字符（当前 ${s.length} 个字符）`);
    if (r.pattern && !new RegExp(r.pattern).test(s))
      fail(`格式不符：${r.pattern}`);
  } else if (r.type === "integer") {
    if (
      !Number.isSafeInteger(v) ||
      (v as number) < r.minimum! ||
      (v as number) > r.maximum!
    )
      fail(`必须为 ${r.minimum} 到 ${r.maximum} 的整数`);
  }
}
const clean = (s: string | null | undefined): string | null =>
  s?.trim().normalize("NFC") || null;
export const exchangeNameKey = (s: string): string =>
  normalizeEntityName(s).normalizedName;
function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`${path}: 存在重复 ID 或规范化名称`);
}
const EXCHANGE_TEXT_ISSUE_LIMIT = 6;
// 短名只用于错误定位：控制字符转空格，最多 18 个码点，避免把整段超长文本
// 写进提示或日志。
function shortLabel(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const flattened = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const chars = [...flattened];
  return chars.length > 18 ? `${chars.slice(0, 18).join("")}…` : flattened;
}
function textLimitIssue(
  location: string,
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  return describeItemoryTextIssue(value, location, { maxLength });
}
/**
 * 导出前的文本预检：返回形如「第 2 件物品「旧档案…」的备注超过 20000 个
 * 字符（当前 20001 个字符）」的可定位问题。只读、不截断、不改写任何数据。
 */
export function exchangeTextLimitIssues(data: ExchangeData): string[] {
  const issues: string[] = [];
  const add = (location: string, value: unknown, maxLength: number): void => {
    const issue = textLimitIssue(location, value, maxLength);
    if (issue) issues.push(issue);
  };
  (data.items ?? []).forEach((item, index) => {
    const prefix = `第 ${index + 1} 件物品「${shortLabel(item?.name)}」的`;
    add(`${prefix}名称`, item?.name, ITEMORY_NAME_MAX_LENGTH);
    add(`${prefix}分类名称`, item?.category, ITEMORY_NAME_MAX_LENGTH);
    add(`${prefix}购入渠道`, item?.channel, ITEMORY_TEXT_MAX_LENGTH);
    add(`${prefix}备注`, item?.notes, ITEMORY_TEXT_MAX_LENGTH);
    add(`${prefix}图标`, item?.icon?.value, ITEMORY_ICON_VALUE_MAX_LENGTH);
    (item?.tags ?? []).forEach((tag, k) =>
      add(
        `${prefix}第 ${k + 1} 个标签名称`,
        tag,
        ITEMORY_NAME_MAX_LENGTH,
      ),
    );
    (item?.moneyEntries ?? []).forEach((entry, k) => {
      add(
        `${prefix}资金记录第 ${k + 1} 条的标题`,
        entry?.title,
        ITEMORY_NAME_MAX_LENGTH,
      );
      add(
        `${prefix}资金记录第 ${k + 1} 条的备注`,
        entry?.note,
        ITEMORY_TEXT_MAX_LENGTH,
      );
    });
    add(`${prefix}退出说明`, item?.exit?.note, ITEMORY_TEXT_MAX_LENGTH);
  });
  (data.catalogs?.categories ?? []).forEach((category) => {
    const prefix = `分类「${shortLabel(category?.name)}」`;
    add(`${prefix}名称`, category?.name, ITEMORY_NAME_MAX_LENGTH);
    add(
      `${prefix}图标`,
      category?.icon?.value,
      ITEMORY_ICON_VALUE_MAX_LENGTH,
    );
  });
  (data.catalogs?.tags ?? []).forEach((tag) => {
    add(
      `标签「${shortLabel(tag?.name)}」名称`,
      tag?.name,
      ITEMORY_NAME_MAX_LENGTH,
    );
  });
  return issues;
}
/** 导出预检入口：有历史超长记录时抛出可定位错误，绝不静默截断。 */
export function assertExchangeTextLimits(data: ExchangeData): void {
  const issues = exchangeTextLimitIssues(data);
  if (!issues.length) return;
  const shown = issues.slice(0, EXCHANGE_TEXT_ISSUE_LIMIT);
  const rest = issues.length - shown.length;
  throw new Error(
    `数据导出预检未通过：\n- ${shown.join("\n- ")}${
      rest > 0 ? `\n- 另有 ${rest} 处同类问题` : ""
    }\n请先缩短上述字段后重试；本次未生成文件，原有数据未被修改。`,
  );
}
export function parseExchange(value: unknown): ExchangeData {
  check(value, EXCHANGE_SCHEMA, "data");
  const d = value as ExchangeData;
  const items = d.items.map((i, n): ExchangeItem => {
    const path = `items[${n}]（${i.name}）`;
    try {
      assertBusinessDate(i.acquiredOn, "acquiredOn");
      if (i.warrantyUntil != null)
        assertBusinessDate(i.warrantyUntil, "warrantyUntil", {
          allowFuture: true,
        });
      const moneyEntries = (i.moneyEntries ?? []).map((m, k) => {
        assertBusinessDate(m.occurredOn, `moneyEntries[${k}].occurredOn`);
        return { ...m, title: m.title.trim(), note: clean(m.note) };
      });
      unique(
        moneyEntries.map((m) => m.id),
        "moneyEntries",
      );
      const x = i.exit
        ? {
            ...i.exit,
            recoveryAmountMinor: i.exit.recoveryAmountMinor ?? null,
            note: clean(i.exit.note),
          }
        : null;
      if (x) {
        assertBusinessDate(x.exitedOn, "exit.exitedOn", { min: i.acquiredOn });
        if (x.reason !== "sold" && x.recoveryAmountMinor !== null)
          throw new Error("exit.recoveryAmountMinor: 非出售退出必须为空");
      }
      let expense = i.acquisitionAmountMinor ?? 0,
        income = x?.recoveryAmountMinor ?? 0;
      for (const m of moneyEntries) {
        if (m.direction === "expense")
          expense = safeAddMinor(expense, m.amountMinor);
        else income = safeAddMinor(income, m.amountMinor);
      }
      assertSafeMinor(i.valuationMinor, "valuationMinor");
      const tags = [
        ...new Map(
          (i.tags ?? []).map((t) => [
            exchangeNameKey(t),
            t.trim().normalize("NFC"),
          ]),
        ).values(),
      ];
      return {
        ...i,
        name: i.name.trim().normalize("NFC"),
        category: clean(i.category),
        tags,
        acquisitionAmountMinor: i.acquisitionAmountMinor ?? null,
        valuationMinor: i.valuationMinor ?? null,
        channel: clean(i.channel),
        warrantyUntil: i.warrantyUntil ?? null,
        notes: clean(i.notes),
        icon: i.icon ?? null,
        cover: i.cover ?? null,
        moneyEntries,
        exit: x,
      };
    } catch (error) {
      throw new Error(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  unique(
    items.map((i) => i.id),
    "items",
  );
  const categories = (d.catalogs?.categories ?? []).map((c, n) => ({
    name: c.name.trim().normalize("NFC"),
    icon: c.icon ?? null,
    sortOrder: c.sortOrder ?? n,
  }));
  const tags = (d.catalogs?.tags ?? []).map((t, n) => ({
    name: t.name.trim().normalize("NFC"),
    color: t.color ?? "#007AFF",
    sortOrder: t.sortOrder ?? n,
  }));
  unique(
    categories.map((c) => exchangeNameKey(c.name)),
    "catalogs.categories",
  );
  unique(
    tags.map((t) => exchangeNameKey(t.name)),
    "catalogs.tags",
  );
  return {
    format: "itemory-data",
    version: 1,
    currency: "CNY",
    items,
    catalogs: { categories, tags },
  };
}
export function parseExchangeText(text: string): ExchangeData {
  if (text.length > 8 * 1024 * 1024)
    throw new Error("data.json 超过 8 MiB 限制");
  return parseExchange(JSON.parse(text.replace(/^\uFEFF/, "")));
}
