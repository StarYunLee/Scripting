import type { IconLibrarySettings, LibraryMode } from "./models";

const DEFAULT_SETTINGS: IconLibrarySettings = {
  owner: "",
  repo: "",
  branch: "main",
  iconDir: "icon",
  jsonPath: "icons.json",
  mode: "unconfigured",
};

export const STANDARD_WORKFLOW_PATH =
  ".github/workflows/generate-icons.yml";
export const STANDARD_WORKFLOW_SCRIPT_PATH = ".github/generate_icons.py";

function trimSlash(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizeMode(value: unknown): LibraryMode {
  if (value === "create" || value === "connect") {
    return value;
  }
  return "unconfigured";
}

export function defaultSettings(): IconLibrarySettings {
  return { ...DEFAULT_SETTINGS };
}

export function normalizeSettings(
  value: Partial<IconLibrarySettings> | null | undefined,
): IconLibrarySettings {
  return {
    owner: (value?.owner ?? "").trim(),
    repo: (value?.repo ?? "").trim(),
    branch:
      (value?.branch ?? DEFAULT_SETTINGS.branch).trim() ||
      DEFAULT_SETTINGS.branch,
    iconDir:
      trimSlash(value?.iconDir ?? DEFAULT_SETTINGS.iconDir) ||
      DEFAULT_SETTINGS.iconDir,
    jsonPath:
      trimSlash(value?.jsonPath ?? DEFAULT_SETTINGS.jsonPath) ||
      DEFAULT_SETTINGS.jsonPath,
    mode: normalizeMode(value?.mode),
  };
}

export function isRepoConfigured(settings: IconLibrarySettings): boolean {
  return Boolean(settings.owner && settings.repo);
}

export function isLibraryReady(settings: IconLibrarySettings): boolean {
  return (
    isRepoConfigured(settings) &&
    settings.mode !== "unconfigured" &&
    Boolean(settings.iconDir && settings.jsonPath)
  );
}

export function iconPath(
  settings: IconLibrarySettings,
  filename: string,
): string {
  return `${settings.iconDir}/${filename}`;
}

export function rawFileUrl(
  settings: IconLibrarySettings,
  repoPath: string,
): string {
  return `https://raw.githubusercontent.com/${settings.owner}/${settings.repo}/${settings.branch}/${repoPath}`;
}

export function subscribeUrl(settings: IconLibrarySettings): string {
  if (!isLibraryReady(settings)) {
    return "";
  }
  return rawFileUrl(settings, settings.jsonPath);
}

export function repoAddress(settings: IconLibrarySettings): string {
  if (!isRepoConfigured(settings)) {
    return "";
  }
  return `${settings.owner}/${settings.repo}`;
}

export function libraryModeTitle(mode: LibraryMode): string {
  if (mode === "create") return "创建图标库";
  if (mode === "connect") return "连接已有图标库";
  return "未选择";
}

export function parseGithubRepoAddress(input: string): {
  owner: string;
  repo: string;
} | null {
  const trimmed = input.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)$/i,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

export function sanitizeRepoPathSegment(raw: string, fallback: string): string {
  const trimmed = trimSlash(raw.trim());
  if (!trimmed) return fallback;
  return trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
}
