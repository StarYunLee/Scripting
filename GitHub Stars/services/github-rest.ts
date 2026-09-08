import { captureCredentialGuard, sessionAwait } from "./session-guard";
import { fetch, type RequestInit, type Response } from "scripting";
import { readToken } from "../auth/token";
import {
  createGitHubError,
  isRateLimitedResponse,
  responseRetryAfter,
} from "./errors";
import { READ_MAX_ATTEMPTS, retryDelayMs, wait } from "./request-retry";
import type { PagedCollection } from "../types";

const API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";

export type RestStarredRepository = {
  id?: unknown;
  node_id?: unknown;
  name?: unknown;
  full_name?: unknown;
  description?: unknown;
  html_url?: unknown;
  language?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  fork?: unknown;
  archived?: unknown;
  private?: unknown;
  visibility?: unknown;
  has_issues?: unknown;
  homepage?: unknown;
  topics?: unknown;
  default_branch?: unknown;
  parent?: {
    full_name?: unknown;
    default_branch?: unknown;
  };
  pushed_at?: unknown;
  starred_at?: unknown;
  updated_at?: unknown;
  owner?: { login?: unknown; avatar_url?: unknown };
};

type RestStarredResponseItem =
  | RestStarredRepository
  | {
      starred_at?: unknown;
      repo?: RestStarredRepository;
    };

function isStarredEnvelope(
  item: RestStarredResponseItem,
): item is { starred_at?: unknown; repo: RestStarredRepository } {
  return (
    typeof item === "object" &&
    item !== null &&
    "repo" in item &&
    typeof item.repo === "object" &&
    item.repo !== null
  );
}

export type RestUser = {
  login?: unknown;
  name?: unknown;
  bio?: unknown;
  avatar_url?: unknown;
  location?: unknown;
  company?: unknown;
  blog?: unknown;
  twitter_username?: unknown;
  followers?: unknown;
  following?: unknown;
  public_repos?: unknown;
};

function resolveToken(tokenOverride?: string): string {
  const token = tokenOverride ?? readToken();
  if (!token) throw createGitHubError("missing_token", "未配置 Token");
  return token;
}

function headers(
  accept = "application/vnd.github+json",
  tokenOverride?: string,
): Record<string, string> {
  return {
    Accept: accept,
    Authorization: `Bearer ${resolveToken(tokenOverride)}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
}

type RequestResult = {
  status: number;
  body: unknown;
  oauthScopes: string | null;
};

async function requestOnce(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<RequestResult> {
  const assertOperationCurrent = captureCredentialGuard();

  const requestHeaders = {
    ...headers("application/vnd.github+json", tokenOverride),
    ...(init.headers ?? {}),
  };
  let response: Response;
  try {
    response = await sessionAwait(
      () =>
        fetch(`${API_BASE}${path}`, {
          ...init,
          headers: requestHeaders,
          timeout: 30,
          debugLabel: `github-rest:${path.split("?")[0]}`,
        }),
      assertOperationCurrent,
    );
  } catch {
    assertOperationCurrent();

    throw createGitHubError("network", "网络请求失败");
  }

  const raw = await sessionAwait(() => response.text(), assertOperationCurrent);
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      assertOperationCurrent();

      body = { message: raw.slice(0, 200) };
    }
  }
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${response.status}`;
    const rateLimited =
      isRateLimitedResponse(response) ||
      (response.status === 403 &&
        /(?:primary|secondary)?\s*rate limit/i.test(message));
    const kind = rateLimited
      ? "rate_limited"
      : response.status === 401
        ? "unauthorized"
        : response.status === 403
          ? "forbidden"
          : response.status === 404
            ? "not_found"
            : response.status >= 500
              ? "server"
              : "unknown";
    const mappedMessage =
      kind === "not_found" &&
      (init.method === "DELETE" || init.method === "PUT")
        ? init.method === "PUT"
          ? "找不到该仓库，或 Token 缺少 public_repo / repo 权限。"
          : "取消 Star 需要 Token 勾选 public_repo。私有仓库还需 repo。请在设置页更换令牌后重试。"
        : kind === "forbidden"
          ? "GitHub 拒绝了请求，可能是权限不足。公开仓库需要 public_repo，私有仓库需要 repo。"
          : message;
    throw createGitHubError(
      kind,
      mappedMessage,
      response.status,
      rateLimited ? responseRetryAfter(response) : null,
    );
  }
  return {
    status: response.status,
    body,
    oauthScopes: response.headers.get("X-OAuth-Scopes"),
  };
}

function isReadMethod(init: RequestInit): boolean {
  return !init.method || init.method === "GET";
}

async function request(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<RequestResult> {
  const assertOperationCurrent = captureCredentialGuard();

  const sessionToken = tokenOverride ?? readToken() ?? undefined;
  for (let attempt = 0; attempt < READ_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await sessionAwait(
        () => requestOnce(path, init, sessionToken),
        assertOperationCurrent,
      );
    } catch (error) {
      assertOperationCurrent();

      const delay = isReadMethod(init) ? retryDelayMs(error, attempt) : null;
      if (delay === null) throw error;
      await sessionAwait(() => wait(delay), assertOperationCurrent);
    }
  }
  throw createGitHubError("unknown", "请求重试已达上限");
}

async function requestJsonWithScopes<T>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<{ data: T; oauthScopes: string | null }> {
  const assertOperationCurrent = captureCredentialGuard();

  const { status, body, oauthScopes } = await sessionAwait(
    () => request(path, init, tokenOverride),
    assertOperationCurrent,
  );
  if (body === null) {
    throw createGitHubError("invalid_response", "响应为空", status);
  }
  return { data: body as T, oauthScopes };
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<T> {
  const assertOperationCurrent = captureCredentialGuard();

  const { status, body } = await sessionAwait(
    () => request(path, init, tokenOverride),
    assertOperationCurrent,
  );
  if (body === null)
    throw createGitHubError("invalid_response", "响应为空", status);
  return body as T;
}

const REST_PAGE_LIMIT = 100;

function appendUniqueRepositories(
  result: RestStarredRepository[],
  seen: Set<string>,
  batch: RestStarredRepository[],
): void {
  for (const item of batch) {
    const key =
      typeof item.node_id === "string" && item.node_id
        ? item.node_id
        : typeof item.full_name === "string" && item.full_name
          ? `name:${item.full_name.toLowerCase()}`
          : typeof item.id === "number"
            ? `id:${item.id}`
            : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
}

export async function fetchStarredRepositories(): Promise<
  PagedCollection<RestStarredRepository>
> {
  const assertOperationCurrent = captureCredentialGuard();

  const result: RestStarredRepository[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= REST_PAGE_LIMIT; page += 1) {
    const batch = await sessionAwait(
      () =>
        requestJson<RestStarredResponseItem[]>(
          `/user/starred?per_page=100&page=${page}&sort=created&direction=desc`,
          { headers: { Accept: "application/vnd.github.star+json" } },
        ),
      assertOperationCurrent,
    );
    if (!Array.isArray(batch))
      throw createGitHubError("invalid_response", "Stars 响应不是数组");
    const unwrapped: RestStarredRepository[] = [];
    for (const item of batch) {
      if (isStarredEnvelope(item)) {
        unwrapped.push({ ...item.repo, starred_at: item.starred_at });
      } else {
        unwrapped.push(item);
      }
    }
    appendUniqueRepositories(result, seen, unwrapped);
    if (batch.length < 100) return { items: result, complete: true };
  }
  return { items: result, complete: false };
}

export async function fetchViewer(): Promise<RestUser> {
  return requestJson<RestUser>("/user");
}

export type TokenValidationResult = {
  oauthScopes: string[];
};

function parseOAuthScopes(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export async function validateToken(
  token: string,
  includePrivateRepositories: boolean,
): Promise<TokenValidationResult> {
  const normalized = token.trim();
  if (!normalized) throw createGitHubError("missing_token", "未配置 Token");

  const authResult = await requestJsonWithScopes<RestUser>(
    "/user",
    {},
    normalized,
  );
  let oauthScopes = parseOAuthScopes(authResult.oauthScopes);
  if (oauthScopes.length === 0) {
    throw createGitHubError(
      "forbidden",
      "请使用 Personal access token (classic)，并授予 user 与 public_repo 权限。",
      403,
    );
  }
  const hasUserScope =
    oauthScopes.includes("user") || oauthScopes.includes("read:user");
  const hasPublicRepositoryScope =
    oauthScopes.includes("public_repo") || oauthScopes.includes("repo");
  if (!hasUserScope) {
    throw createGitHubError("forbidden", "Token 缺少 user 权限。", 403);
  }
  if (!hasPublicRepositoryScope) {
    throw createGitHubError("forbidden", "Token 缺少 public_repo 权限。", 403);
  }

  if (includePrivateRepositories) {
    const repositoryResult = await requestJsonWithScopes<
      RestStarredRepository[]
    >(
      "/user/repos?affiliation=owner&visibility=all&sort=pushed&direction=desc&per_page=1&page=1",
      {},
      normalized,
    );
    if (!Array.isArray(repositoryResult.data)) {
      throw createGitHubError("invalid_response", "仓库响应不是数组");
    }
    oauthScopes = parseOAuthScopes(repositoryResult.oauthScopes);
    if (!oauthScopes.includes("repo")) {
      throw createGitHubError(
        "forbidden",
        "显示私有仓库需要 Personal access token (classic) 的 repo 权限。",
        403,
      );
    }
  }

  return { oauthScopes };
}

export function parseRepositoryRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "");
  if (/^https?:\/\//i.test(withoutPrefix)) {
    const match = withoutPrefix.match(
      /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)/i,
    );
    if (!match) return null;
    return `${match[1]}/${match[2].replace(/\.git$/i, "")}`;
  }
  const [owner, repo, ...rest] = withoutPrefix.split("/").filter(Boolean);
  if (!owner || !repo || rest.length > 0) return null;
  if (owner.startsWith(".")) return null;
  return `${owner}/${repo.replace(/\.git$/i, "")}`;
}

function starredPath(fullName: string): string {
  const [owner, repo, ...rest] = fullName.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw createGitHubError("invalid_response", "仓库名称无效");
  }
  return `/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export async function unstarRepository(fullName: string): Promise<void> {
  const assertOperationCurrent = captureCredentialGuard();

  await sessionAwait(
    () => request(starredPath(fullName), { method: "DELETE" }),
    assertOperationCurrent,
  );
}

export async function starRepository(fullName: string): Promise<void> {
  const assertOperationCurrent = captureCredentialGuard();

  await sessionAwait(
    () =>
      request(starredPath(fullName), {
        method: "PUT",
        headers: { "Content-Length": "0" },
      }),
    assertOperationCurrent,
  );
}

export type UpdateOwnedRepositoryInput = {
  description?: string | null;
  homepage?: string | null;
  hasIssues?: boolean;
  topics?: string[];
};

export async function fetchOwnedRepositories(
  includePrivateRepositories: boolean,
): Promise<PagedCollection<RestStarredRepository>> {
  const assertOperationCurrent = captureCredentialGuard();

  const result: RestStarredRepository[] = [];
  const seen = new Set<string>();
  const visibility = includePrivateRepositories ? "all" : "public";
  const { data, oauthScopes } = await sessionAwait(
    () =>
      requestJsonWithScopes<RestStarredRepository[]>(
        `/user/repos?affiliation=owner&visibility=${visibility}&sort=pushed&direction=desc&per_page=100&page=1`,
      ),
    assertOperationCurrent,
  );
  if (includePrivateRepositories) {
    const scopes = (oauthScopes ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
    if (!scopes.includes("repo")) {
      throw createGitHubError(
        "forbidden",
        "显示私有仓库需要 Personal access token (classic) 的 repo 权限。",
        403,
      );
    }
  }
  if (!Array.isArray(data)) {
    throw createGitHubError("invalid_response", "仓库响应不是数组");
  }
  appendUniqueRepositories(result, seen, data);
  if (data.length < 100) return { items: result, complete: true };
  for (let page = 2; page <= REST_PAGE_LIMIT; page += 1) {
    const batch = await sessionAwait(
      () =>
        requestJson<RestStarredRepository[]>(
          `/user/repos?affiliation=owner&visibility=${visibility}&sort=pushed&direction=desc&per_page=100&page=${page}`,
        ),
      assertOperationCurrent,
    );
    if (!Array.isArray(batch)) {
      throw createGitHubError("invalid_response", "仓库响应不是数组");
    }
    appendUniqueRepositories(result, seen, batch);
    if (batch.length < 100) return { items: result, complete: true };
  }
  return { items: result, complete: false };
}

function repositoryPath(fullName: string): string {
  const [owner, repo, ...rest] = fullName.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw createGitHubError("invalid_response", "仓库名称无效");
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function replaceOwnedRepositoryTopics(
  fullName: string,
  topics: string[],
): Promise<string[]> {
  const assertOperationCurrent = captureCredentialGuard();

  const result = await sessionAwait(
    () =>
      requestJson<{ names?: unknown }>(`${repositoryPath(fullName)}/topics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: topics }),
      }),
    assertOperationCurrent,
  );
  if (!Array.isArray(result.names)) return topics;
  return result.names.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export async function updateOwnedRepository(
  fullName: string,
  input: UpdateOwnedRepositoryInput,
): Promise<RestStarredRepository> {
  const assertOperationCurrent = captureCredentialGuard();

  const hasMetadata =
    input.description !== undefined ||
    input.homepage !== undefined ||
    input.hasIssues !== undefined;
  let updated: RestStarredRepository | null = null;
  if (hasMetadata) {
    updated = await sessionAwait(
      () =>
        requestJson<RestStarredRepository>(repositoryPath(fullName), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.homepage !== undefined
              ? { homepage: input.homepage }
              : {}),
            ...(input.hasIssues !== undefined
              ? { has_issues: input.hasIssues }
              : {}),
          }),
        }),
      assertOperationCurrent,
    );
  }
  if (input.topics !== undefined) {
    const topics = input.topics;
    const names = await sessionAwait(
      () => replaceOwnedRepositoryTopics(fullName, topics),
      assertOperationCurrent,
    );
    if (!updated) {
      updated = await sessionAwait(
        () => fetchRepository(fullName),
        assertOperationCurrent,
      );
    }
    updated = { ...updated, topics: names };
  }
  if (!updated) {
    throw createGitHubError("invalid_response", "没有可保存的仓库变更");
  }
  return updated;
}

export async function archiveOwnedRepository(
  fullName: string,
): Promise<RestStarredRepository> {
  return requestJson<RestStarredRepository>(repositoryPath(fullName), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true }),
  });
}

export type SyncForkResponse = {
  message?: unknown;
  merge_type?: unknown;
  base_branch?: unknown;
};

export async function syncOwnedFork(
  fullName: string,
  branch: string,
): Promise<SyncForkResponse> {
  return requestJson<SyncForkResponse>(
    `${repositoryPath(fullName)}/merge-upstream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
    },
  );
}

export type RestCompareResponse = {
  status?: unknown;
  ahead_by?: unknown;
  behind_by?: unknown;
  html_url?: unknown;
};

export async function compareForkWithUpstream(
  forkFullName: string,
  upstreamFullName: string,
  upstreamBranch: string,
  forkBranch: string,
): Promise<RestCompareResponse> {
  const [upstreamOwner] = upstreamFullName.split("/");
  const [forkOwner] = forkFullName.split("/");
  if (!upstreamOwner || !forkOwner) {
    throw createGitHubError("invalid_response", "Fork 上游信息无效");
  }
  const basehead = `${upstreamOwner}:${upstreamBranch}...${forkOwner}:${forkBranch}`;
  return requestJson<RestCompareResponse>(
    `${repositoryPath(forkFullName)}/compare/${encodeURIComponent(basehead)}`,
  );
}

export async function fetchRepository(
  fullName: string,
): Promise<RestStarredRepository> {
  return requestJson<RestStarredRepository>(repositoryPath(fullName));
}

export type ForkUpstreamComparison = {
  upstreamFullName: string;
  upstreamBranch: string;
  aheadBy: number;
  behindBy: number;
};

function requiredString(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw createGitHubError("invalid_response", `${label} 缺失`);
}

function comparisonCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

type ForkParentInfo = {
  upstreamFullName: string;
  upstreamBranch: string;
};

const forkParentCache = new Map<string, ForkParentInfo>();

export function clearForkParentCache(): void {
  forkParentCache.clear();
}

async function resolveForkParent(
  forkFullName: string,
  force = false,
): Promise<ForkParentInfo> {
  const assertOperationCurrent = captureCredentialGuard();

  const cached = forkParentCache.get(forkFullName);
  if (!force && cached) return cached;
  const repository = await sessionAwait(
    () => fetchRepository(forkFullName),
    assertOperationCurrent,
  );
  if (repository.fork !== true || !repository.parent) {
    throw createGitHubError(
      "invalid_response",
      "该仓库没有可用的 Fork 上游信息",
    );
  }
  const parent: ForkParentInfo = {
    upstreamFullName: requiredString(
      repository.parent.full_name,
      "Fork 上游仓库名称",
    ),
    upstreamBranch: requiredString(
      repository.parent.default_branch,
      "Fork 上游默认分支",
    ),
  };
  forkParentCache.set(forkFullName, parent);
  return parent;
}

export async function fetchForkUpstreamComparison(
  forkFullName: string,
  forkBranch: string,
  options?: { refreshParent?: boolean },
): Promise<ForkUpstreamComparison> {
  const assertOperationCurrent = captureCredentialGuard();

  const parent = await sessionAwait(
    () => resolveForkParent(forkFullName, options?.refreshParent === true),
    assertOperationCurrent,
  );
  const comparison = await sessionAwait(
    () =>
      compareForkWithUpstream(
        forkFullName,
        parent.upstreamFullName,
        parent.upstreamBranch,
        forkBranch,
      ),
    assertOperationCurrent,
  );
  return {
    upstreamFullName: parent.upstreamFullName,
    upstreamBranch: parent.upstreamBranch,
    aheadBy: comparisonCount(comparison.ahead_by),
    behindBy: comparisonCount(comparison.behind_by),
  };
}
