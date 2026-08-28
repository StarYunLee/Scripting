const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"] as const;

type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export function isAllowedExtension(ext: string): ext is AllowedExtension {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

export function normalizeExtension(ext: string): string {
  const value = ext.trim().toLowerCase();
  if (!value) {
    return "";
  }
  return value.startsWith(".") ? value : `.${value}`;
}

export function sanitizeIconName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

export function splitFilename(filename: string): { name: string; ext: string } {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) {
    return { name: trimmed, ext: "" };
  }
  return {
    name: trimmed.slice(0, dot),
    ext: normalizeExtension(trimmed.slice(dot)),
  };
}

export function buildFilename(name: string, ext: string): string {
  const safeName = sanitizeIconName(name);
  const safeExt = normalizeExtension(ext) || ".png";
  if (!safeName) {
    throw new Error("文件名不能为空");
  }
  if (!isAllowedExtension(safeExt)) {
    throw new Error(`不支持的扩展名：${safeExt}`);
  }
  return `${safeName}${safeExt}`;
}

export function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] ?? "");
  } catch {
    const parts = url.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] ?? "");
  }
}
