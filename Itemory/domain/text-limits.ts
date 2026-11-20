/**
 * 手动录入、命令层与数据交换共用的文本长度契约。
 *
 * 长度口径：JavaScript `String.length`，即 UTF-16 code unit 数量，与
 * exchange-format 现有 JSON Schema `maxLength` 判定完全一致。不要改成
 * Unicode 码点（`[...s].length`）：emoji 等补充平面字符在本口径下计 2，
 * 改变口径会让同一字段在录入、导出、导入之间出现不同上限。
 *
 * 本模块只描述“新写入”的上限。历史数据读取、完整备份的领域校验不使用
 * 这些限制，避免旧库里的超长字段把恢复路径锁死。
 */
export const ITEMORY_NAME_MAX_LENGTH = 500;
export const ITEMORY_TEXT_MAX_LENGTH = 20000;
export const ITEMORY_ICON_VALUE_MAX_LENGTH = 128;

export interface ItemoryTextOptions {
  /** 长度上限；名称/标题类字段传 ITEMORY_NAME_MAX_LENGTH。 */
  maxLength?: number;
  /** 错误信息中的字段名，默认使用 field。 */
  label?: string;
}

/** 与交换格式 maxLength 相同的 UTF-16 长度口径。 */
export function itemoryTextLength(value: string): number {
  return value.length;
}

/** 超限时返回可定位的中文问题描述；未超限或值为空返回 null。 */
export function describeItemoryTextIssue(
  value: string | null | undefined,
  field: string,
  options: ItemoryTextOptions = {},
): string | null {
  if (value === null || value === undefined) return null;
  const maxLength = options.maxLength ?? ITEMORY_TEXT_MAX_LENGTH;
  const length = itemoryTextLength(value);
  if (length <= maxLength) return null;
  return `${options.label ?? field}超过 ${maxLength} 个字符（当前 ${length} 个字符）`;
}

/** 超限时抛出简洁中文错误；返回原值便于链式使用。 */
export function assertItemoryText(
  value: string | null | undefined,
  field: string,
  options: ItemoryTextOptions = {},
): string | null {
  const issue = describeItemoryTextIssue(value, field, options);
  if (issue) throw new Error(issue);
  return value ?? null;
}
