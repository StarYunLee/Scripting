import { fetch, Headers, type RequestInit } from "scripting";
import { formatError, MissingProfilePatError } from "./errors";
import type {
  GithubAvailabilityState,
  IconLibrarySettings,
  RepoContext,
  RepoEntry,
} from "./models";

const PROFILE_TOKEN_PREFIX = "icon_library_github_token_profile_";
const PUBLIC_REPO_CACHE_TTL_MS = 5 * 60 * 1000;
const verifiedPublicRepos = new Map<string, number>();

type RepoFileMeta = {
  path: string;
  sha: string;
  size: number;
  downloadUrl: string | null;
};

type ContentsResponse = {
  path?: string;
  sha?: string;
  size?: number;
  download_url?: string | null;
  message?: string;
  content?: string | ContentsResponse | null;
};

function hasKeychain(): boolean {
  try {
    return typeof Keychain !== "undefined" && typeof Keychain.get === "function";
  } catch {
    return false;
  }
}

export function patKeyForProfile(profileId: string): string {
  return `${PROFILE_TOKEN_PREFIX}${profileId}`;
}

/** 读取指定 profile 的 PAT；不会读取或回退任何全局凭证。 */
export function getProfilePat(profileId: string | null | undefined): string | null {
  if (!hasKeychain()) {
    return null;
  }
  if (!profileId) {
    return null;
  }
  try {
    const value = Keychain.get(patKeyForProfile(profileId));
    if (value && value.trim()) {
      return value.trim();
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function setProfilePat(profileId: string, token: string): void {
  if (!hasKeychain()) {
    return;
  }
  const value = token.trim();
  if (!value) {
    Keychain.remove(patKeyForProfile(profileId));
    return;
  }
  Keychain.set(patKeyForProfile(profileId), value);
}

export function removeProfilePat(profileId: string): void {
  if (!hasKeychain()) {
    return;
  }
  Keychain.remove(patKeyForProfile(profileId));
}

function contextToken(context: RepoContext): string | null {
  const draftToken = context.token?.trim();
  return draftToken || getProfilePat(context.profileId);
}

export function getGithubAvailability(
  profileId: string | null | undefined,
): GithubAvailabilityState {
  try {
    if (getProfilePat(profileId)) {
      return {
        hasPat: true,
        summary: "当前仓库已配置个人访问令牌。",
      };
    }
    return {
      hasPat: false,
      summary: "当前仓库未配置个人访问令牌。",
    };
  } catch (error) {
    return {
      hasPat: false,
      summary: `GitHub 状态检测失败：${formatError(error)}`,
    };
  }
}

export function prefersPatChannel(profileId: string): boolean {
  return getProfilePat(profileId) !== null;
}

type RepositoryResponse = {
  private?: boolean;
  message?: string;
};

export async function validatePublicRepository(
  settings: IconLibrarySettings,
  token?: string,
): Promise<void> {
  if (!settings.owner || !settings.repo) {
    throw new Error("请先填写 GitHub 仓库地址。");
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Icon-Library",
  };
  const value = token?.trim();
  if (value) {
    headers.Authorization = `Bearer ${value}`;
  }
  const response = await fetch(
    `https://api.github.com/repos/${settings.owner}/${settings.repo}`,
    { headers },
  );
  const json = ((await response.json()) as RepositoryResponse) ?? {};
  if (response.status === 404) {
    throw new Error(
      "找不到公开仓库。请确认地址正确且仓库已设为 Public；当前版本不支持私有仓库。",
    );
  }
  if (!response.ok) {
    throw new Error(json.message || `检查仓库失败：HTTP ${response.status}`);
  }
  if (json.private === true) {
    throw new Error(
      "当前版本仅支持公开仓库。私有仓库无法可靠显示图标或生成可访问的订阅地址。",
    );
  }
}

function publicRepoKey(settings: IconLibrarySettings): string {
  return `${settings.owner.trim().toLowerCase()}/${settings.repo
    .trim()
    .toLowerCase()}`;
}

async function ensurePublicRepository(context: RepoContext): Promise<void> {
  const key = publicRepoKey(context.settings);
  const verifiedAt = verifiedPublicRepos.get(key) ?? 0;
  if (Date.now() - verifiedAt < PUBLIC_REPO_CACHE_TTL_MS) {
    return;
  }
  await validatePublicRepository(context.settings);
  verifiedPublicRepos.set(key, Date.now());
}

function apiUrl(settings: IconLibrarySettings, repoPath: string): string {
  const trimmed = repoPath.replace(/^\/+|\/+$/g, "");
  const base = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents`;
  if (!trimmed) {
    return `${base}?ref=${encodeURIComponent(settings.branch)}`;
  }
  const encoded = trimmed
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${encoded}?ref=${encodeURIComponent(settings.branch)}`;
}

function isTransientStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fallbackRequest(
  context: RepoContext,
  repoPath: string,
  init?: RequestInit,
): Promise<{ status: number; json: ContentsResponse | ContentsResponse[] }> {
  const { profileId, settings } = context;
  await ensurePublicRepository(context);
  const method = (init?.method ?? "GET").toUpperCase();
  const isRead = method === "GET";
  const token = isRead ? null : contextToken(context);

  // 写操作必须有 PAT；读操作允许匿名（公开仓库）。
  if (!token && !isRead) {
    throw new MissingProfilePatError(profileId);
  }

  let lastStatus = 0;
  let lastJson: ContentsResponse | ContentsResponse[] = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    headers.set("User-Agent", "Icon-Library");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(apiUrl(settings, repoPath), {
      ...init,
      headers,
    });
    lastStatus = response.status;
    lastJson = (await response.json()) as ContentsResponse | ContentsResponse[];
    if (!isTransientStatus(response.status)) {
      return { status: response.status, json: lastJson };
    }
    await sleep(400 * (attempt + 1));
  }
  return { status: lastStatus, json: lastJson };
}

function asFileMeta(path: string, value: unknown): RepoFileMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const sha = typeof record.sha === "string" ? record.sha : "";
  if (!sha) {
    return null;
  }
  const download =
    typeof record.download_url === "string" ? record.download_url : null;
  const filePath = typeof record.path === "string" ? record.path : path;
  const size = typeof record.size === "number" ? record.size : 0;
  return {
    path: filePath,
    sha,
    size,
    downloadUrl: download,
  };
}

export async function getFileMeta(
  context: RepoContext,
  repoPath: string,
): Promise<RepoFileMeta | null> {
  const { status, json } = await fallbackRequest(context, repoPath, {
    method: "GET",
  });
  if (status === 404) {
    return findFileInParentDir(context, repoPath);
  }
  if (status >= 400) {
    const message = Array.isArray(json) ? "GitHub API 请求失败" : json.message;
    throw new Error(message || `GitHub API HTTP ${status}`);
  }
  if (Array.isArray(json)) {
    const wanted = repoPath.split("/").pop()?.toLowerCase() ?? "";
    const match = json.find((item) => {
      const name = (item.path ?? "").split("/").pop()?.toLowerCase() ?? "";
      return name === wanted;
    });
    return match ? asFileMeta(repoPath, match) : findFileInParentDir(context, repoPath);
  }
  return asFileMeta(repoPath, json) ?? findFileInParentDir(context, repoPath);
}

async function findFileInParentDir(
  context: RepoContext,
  repoPath: string,
): Promise<RepoFileMeta | null> {
  const parts = repoPath.split("/").filter(Boolean);
  const filename = parts.pop();
  if (!filename) {
    return null;
  }
  const parent = parts.join("/");
  const entries = await listPath(context, parent);
  if (!entries) {
    return null;
  }
  const match = entries.find(
    (item) =>
      item.type === "file" &&
      item.name.toLowerCase() === filename.toLowerCase(),
  );
  if (!match?.sha) {
    return null;
  }
  return {
    path: match.path || `${parent}/${match.name}`,
    sha: match.sha,
    size: match.size,
    downloadUrl: match.downloadUrl,
  };
}

function writeRequestError(
  status: number,
  fallback: string,
): Error {
  if (status === 401) {
    return new Error("GitHub 凭证无效或已过期。");
  }
  if (status === 403 || status === 404) {
    return new Error(
      "目标仓库没有写入权限。请确认 Token 已授权目标仓库，并授予 Contents: Read and write。",
    );
  }
  return new Error(fallback || `GitHub 请求失败：HTTP ${status}`);
}

export async function putFile(options: {
  context: RepoContext;
  repoPath: string;
  message: string;
  data: Data;
  sha?: string;
}): Promise<RepoFileMeta> {
  const { context, repoPath, message, data, sha } = options;
  const { settings } = context;
  const body: Record<string, string> = {
    message,
    content: data.toBase64String(),
    branch: settings.branch,
  };
  if (sha) {
    body.sha = sha;
  }

  const { status, json } = await fallbackRequest(context, repoPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (status >= 400 || Array.isArray(json)) {
    const messageText = Array.isArray(json) ? "上传失败" : json.message;
    throw writeRequestError(
      status,
      messageText || `上传失败：HTTP ${status}`,
    );
  }
  const nestedContent =
    json.content && typeof json.content === "object"
      ? json.content
      : null;
  const meta =
    asFileMeta(repoPath, nestedContent) ??
    asFileMeta(repoPath, json);
  if (meta) {
    return meta;
  }

  // GitHub 的成功响应通常把文件信息放在 content；若宿主丢失该字段，
  // 再回读一次。HTTP 已是 2xx，回读失败也不能把已完成的上传误报为失败。
  try {
    const confirmed = await getFileMeta(context, repoPath);
    if (confirmed) {
      return confirmed;
    }
  } catch {
    /* PUT 已成功，元数据回读只用于补全返回值。 */
  }
  return {
    path: repoPath,
    sha: "",
    size: data.size,
    downloadUrl: null,
  };
}

export async function deleteFile(options: {
  context: RepoContext;
  repoPath: string;
  message: string;
  sha: string;
}): Promise<void> {
  const { context, repoPath, message, sha } = options;
  const { settings } = context;
  const { status, json } = await fallbackRequest(context, repoPath, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      sha,
      branch: settings.branch,
    }),
  });
  if (status >= 400) {
    const messageText = Array.isArray(json) ? "删除失败" : json.message;
    throw writeRequestError(
      status,
      messageText || `删除失败：HTTP ${status}`,
    );
  }
}

function asRepoEntry(value: Record<string, unknown>): RepoEntry | null {
  const name = typeof value.name === "string" ? value.name : "";
  const path = typeof value.path === "string" ? value.path : name;
  const type = value.type === "dir" ? "dir" : value.type === "file" ? "file" : null;
  if (!name || !type) {
    return null;
  }
  return {
    name,
    path,
    type,
    sha: typeof value.sha === "string" ? value.sha : "",
    size: typeof value.size === "number" ? value.size : 0,
    downloadUrl:
      typeof value.download_url === "string" ? value.download_url : null,
  };
}

export async function listPath(
  context: RepoContext,
  repoPath: string,
): Promise<RepoEntry[] | null> {
  const path = repoPath.replace(/^\/+|\/+$/g, "");
  const { status, json } = await fallbackRequest(context, path, {
    method: "GET",
  });
  if (status === 404) {
    return null;
  }
  if (status >= 400) {
    const message = Array.isArray(json) ? "GitHub API 请求失败" : json.message;
    throw new Error(message || `GitHub API HTTP ${status}`);
  }
  const items = Array.isArray(json) ? json : [json];
  return items
    .map((item) => asRepoEntry(item as Record<string, unknown>))
    .filter((item): item is RepoEntry => item != null);
}

export async function pathExists(
  context: RepoContext,
  repoPath: string,
): Promise<boolean> {
  try {
    const listed = await listPath(context, repoPath);
    if (listed != null) {
      return true;
    }
  } catch {
    /* fall through to file meta */
  }
  return (await getFileMeta(context, repoPath)) != null;
}

export async function putTextFile(options: {
  context: RepoContext;
  repoPath: string;
  message: string;
  text: string;
  sha?: string;
}): Promise<RepoFileMeta> {
  const data = Data.fromRawString(options.text, "utf-8");
  if (!data) {
    throw new Error("无法编码文本文件");
  }
  return putFile({
    context: options.context,
    repoPath: options.repoPath,
    message: options.message,
    data,
    sha: options.sha,
  });
}

export async function readBinaryFile(
  context: RepoContext,
  repoPath: string,
): Promise<Data> {
  const meta = await getFileMeta(context, repoPath);
  if (meta?.downloadUrl) {
    const response = await fetch(meta.downloadUrl, {
      headers: { "User-Agent": "Icon-Library" },
    });
    if (response.ok) {
      return await response.data();
    }
  }

  const { status, json } = await fallbackRequest(context, repoPath, {
    method: "GET",
  });
  const encoded =
    !Array.isArray(json) && typeof json.content === "string"
      ? json.content
      : "";
  const data = encoded
    ? Data.fromBase64String(encoded.replace(/\s/g, ""))
    : null;
  if (status >= 400 || !data) {
    const message = Array.isArray(json) ? "下载失败" : json.message;
    throw new Error(message || `下载 ${repoPath} 失败：HTTP ${status}`);
  }
  return data;
}

type JsonObject = Record<string, unknown>;

async function gitApi(
  context: RepoContext,
  apiPath: string,
  init?: RequestInit,
): Promise<{ status: number; json: JsonObject }> {
  const { profileId, settings } = context;
  await ensurePublicRepository(context);
  const token = getProfilePat(profileId);
  if (!token) {
    throw new MissingProfilePatError(profileId);
  }
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/${apiPath}`;
  let lastStatus = 0;
  let lastJson: JsonObject = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Icon-Library",
        ...(init?.headers ?? {}),
      },
    });
    lastStatus = response.status;
    lastJson = ((await response.json()) as JsonObject) ?? {};
    if (!isTransientStatus(response.status)) {
      return { status: response.status, json: lastJson };
    }
    await sleep(400 * (attempt + 1));
  }
  return { status: lastStatus, json: lastJson };
}

export async function commitFiles(options: {
  context: RepoContext;
  message: string;
  files?: Array<{ path: string; data: Data }>;
  deletions?: string[];
}): Promise<void> {
  const { context, message } = options;
  const { profileId, settings } = context;
  const files = options.files ?? [];
  const deletions = options.deletions ?? [];
  if (files.length === 0 && deletions.length === 0) {
    return;
  }
  if (!prefersPatChannel(profileId)) {
    throw new MissingProfilePatError(profileId);
  }

  const ref = await gitApi(
    context,
    `git/ref/heads/${encodeURIComponent(settings.branch)}`,
  );
  if (ref.status >= 400 || typeof ref.json.object !== "object" || !ref.json.object) {
    throw writeRequestError(ref.status, "读取分支失败，无法一次提交多文件。");
  }
  const headSha = (ref.json.object as JsonObject).sha;
  if (typeof headSha !== "string" || !headSha) {
    throw new Error("读取分支最新提交失败。");
  }

  const commit = await gitApi(context, `git/commits/${headSha}`);
  const baseTree =
    commit.json.tree && typeof commit.json.tree === "object"
      ? ((commit.json.tree as JsonObject).sha as string | undefined)
      : undefined;
  if (commit.status >= 400 || !baseTree) {
    throw writeRequestError(commit.status, "读取提交树失败。");
  }

  const treeItems: JsonObject[] = [];
  for (const file of files) {
    const blob = await gitApi(context, "git/blobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: file.data.toBase64String(),
        encoding: "base64",
      }),
    });
    const blobSha = blob.json.sha;
    if (blob.status >= 400 || typeof blobSha !== "string") {
      throw writeRequestError(blob.status, `创建文件失败：${file.path}`);
    }
    treeItems.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blobSha,
    });
  }
  for (const path of deletions) {
    treeItems.push({
      path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }

  const tree = await gitApi(context, "git/trees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTree,
      tree: treeItems,
    }),
  });
  const treeSha = tree.json.sha;
  if (tree.status >= 400 || typeof treeSha !== "string") {
    throw writeRequestError(tree.status, "创建提交树失败。");
  }

  const created = await gitApi(context, "git/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [headSha],
    }),
  });
  const newSha = created.json.sha;
  if (created.status >= 400 || typeof newSha !== "string") {
    throw writeRequestError(created.status, "创建提交失败。");
  }

  const updated = await gitApi(
    context,
    `git/refs/heads/${encodeURIComponent(settings.branch)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newSha }),
    },
  );
  if (updated.status >= 400) {
    throw writeRequestError(updated.status, "更新分支失败。");
  }
}

