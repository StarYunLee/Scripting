import type { ProviderId } from "../../models";

export type DashboardLabelAccount = { key: string; provider: ProviderId; title: string };
const LIMIT = 10;

function clean(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Approximate text budget: CJK/emoji consume two Latin units, never split a surrogate pair. */
function units(value: string): number {
  return Array.from(value).reduce((n, c) => n + (c === "…" ? 1 : c.codePointAt(0)! > 0xff ? 2 : 1), 0);
}
function take(value: string, budget: number, end = false): string {
  const chars = Array.from(value);
  if (end) chars.reverse();
  const selected: string[] = [];
  let count = 0;
  for (const char of chars) {
    const width = units(char);
    if (count + width > budget) break;
    count += width; selected.push(char);
  }
  return (end ? selected.reverse() : selected).join("");
}
export function compactDashboardLabel(value: string, budget = LIMIT): string {
  const text = clean(value);
  if (units(text) <= budget) return text;
  const head = Math.ceil((budget - 1) / 2);
  return `${take(text, head)}…${take(text, budget - head - 1, true)}`;
}

function identity(title: string): { text: string; local?: string; domain?: string } {
  const text = clean(title);
  const email = /^([^@\s]+)@([^@\s]+)$/.exec(text);
  if (email) return { text: email[1], local: email[1], domain: email[2].toLowerCase() };
  const phone = text.replace(/[\s()+.-]/g, "");
  if (/^[\d*xX•●]{7,18}$/.test(phone) && /\d{4}$/.test(phone))
    return { text: `尾号 ${phone.slice(-4)}` };
  return { text: text || "账号" };
}
function stableTag(key: string): string {
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
function duplicateKeys(accounts: DashboardLabelAccount[], labels: Record<string, string>): Set<string> {
  const seen = new Map<string, string[]>();
  for (const account of accounts) {
    const group = `${account.provider}:${labels[account.key].toLowerCase()}`;
    seen.set(group, [...(seen.get(group) || []), account.key]);
  }
  return new Set([...seen.values()].filter(keys => keys.length > 1).flat());
}

/** Use all configured accounts before hiding/capping; never base suffixes on display order or plan. */
export function dashboardAccountLabels(accounts: DashboardLabelAccount[]): Record<string, string> {
  const unique = [...new Map(accounts.map(account => [account.key, account])).values()];
  const identities = new Map(unique.map(account => [account.key, identity(account.title)]));
  const labels: Record<string, string> = Object.create(null);
  for (const account of unique) labels[account.key] = compactDashboardLabel(identities.get(account.key)!.text);
  // Matching email locals retain a small but explicit domain clue before falling back to a suffix.
  for (const key of duplicateKeys(unique, labels)) {
    const id = identities.get(key)!;
    if (id.local && id.domain) {
      labels[key] = `${compactDashboardLabel(id.local, 5)}@${compactDashboardLabel(id.domain, 4)}`;
    }
  }
  const tagged = new Set<string>();
  for (let length = 4; length <= 7; length++) {
    const duplicates = duplicateKeys(unique, labels);
    if (!duplicates.size) return labels;
    for (const key of duplicates) tagged.add(key);
    for (const key of tagged) {
      const id = identities.get(key)!;
      const source = id.text.startsWith("尾号 ") ? id.text.slice(-4) : id.text;
      const prefix = take(source, LIMIT - length - 1);
      labels[key] = `${prefix}·${stableTag(key).slice(-length)}`;
    }
  }
  // Very rare full-hash/natural-label collisions: deterministic final fallback, independent of order.
  const duplicates = duplicateKeys(unique, labels);
  const ordered = unique.filter(account => duplicates.has(account.key)).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  ordered.forEach((account, index) => {
    let n = index + 1;
    let candidate: string;
    do { candidate = `账号 #${n++}`; }
    while (unique.some(other => other.key !== account.key && other.provider === account.provider && labels[other.key] === candidate));
    labels[account.key] = candidate;
  });
  return labels;
}
