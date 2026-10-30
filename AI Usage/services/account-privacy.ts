/**
 * 隐藏账号标识的中间部分，仅用于 App 内展示。
 * 邮箱：按本地部分长度保留前后各 1–2 个字符；纯数字手机号：保留前 3 位与后 4 位；
 * 其它标识或过短的纯数字保持原样。
 */
export function maskEmailAddress(value: string): string {
  if (/^\d+$/.test(value)) {
    if (value.length < 8) return value;
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }

  const match = /^([^@\s]+)@([^@\s]+)$/.exec(value);
  if (!match) return value;

  const local = Array.from(match[1]);
  const domain = match[2];
  if (local.length === 1) return `***@${domain}`;
  if (local.length <= 4) return `${local[0]}***${local.at(-1)}@${domain}`;
  return `${local.slice(0, 2).join("")}***${local.slice(-2).join("")}@${domain}`;
}
