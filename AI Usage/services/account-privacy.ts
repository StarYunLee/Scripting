export function maskEmailAddress(value: string): string {
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(value);
  if (!match) return value;

  const local = Array.from(match[1]);
  const domain = match[2];
  if (local.length === 1) return `***@${domain}`;
  if (local.length <= 4) return `${local[0]}***${local.at(-1)}@${domain}`;
  return `${local.slice(0, 2).join("")}***${local.slice(-2).join("")}@${domain}`;
}
