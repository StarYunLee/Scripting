import { fetch, type RequestInit, type Response } from "scripting";
import { readToken } from "../auth/token";
import {
  createGitHubError,
  isRateLimitedResponse,
  responseRetryAfter,
} from "./errors";

import { retryDelayMs, wait } from "./request-retry";

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

function headers(
  accept = "application/vnd.github+json",
): Record<string, string> {
  const token = readToken();
  if (!token) throw createGitHubError("missing_token", "未配置 Token");
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
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
): Promise<RequestResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...headers(), ...(init.headers ?? {}) },
      timeout: 30,
      debugLabel: `github-rest:${path.split("?")[0]}`,
    });
  } catch {
    throw createGitHubError("network", "网络请求失败");
  }

  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
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
): Promise<RequestResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestOnce(path, init);
    } catch (error) {
      const delay = isReadMethod(init) ? retryDelayMs(error, attempt) : null;
      if (delay === null) throw error;
      await wait(delay);
    }
  }
}

async function requestJsonWithScopes<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; oauthScopes: string | null }> {
  const { status, body, oauthScopes } = await request(path, init);
  if (body === null) {
    throw createGitHubError("invalid_response", "响应为空", status);
  }
  return { data: body as T, oauthScopes };
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { status, body } = await request(path, init);
  if (body === null)
    throw createGitHubError("invalid_response", "响应为空", status);
  return body as T;
}

export async function fetchStarredRepositories(): Promise<
  RestStarredRepository[]
> {
  const result: RestStarredRepository[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await requestJson<RestStarredResponseItem[]>(
      `/user/starred?per_page=100&page=${page}&sort=created&direction=desc`,
      { headers: { Accept: "application/vnd.github.star+json" } },
    );
    if (!Array.isArray(batch))
      throw createGitHubError("invalid_response", "Stars 响应不是数组");
    for (const item of batch) {
      if (isStarredEnvelope(item)) {
        result.push({ ...item.repo, starred_at: item.starred_at });
      } else {
        result.push(item);
      }
    }
    if (batch.length < 100) return result;
  }
  return result;
}

export async function fetchViewer(): Promise<RestUser> {
  return requestJson<RestUser>("/user");
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
  await request(starredPath(fullName), { method: "DELETE" });
}

export async function starRepository(fullName: string): Promise<void> {
  await request(starredPath(fullName), {
    method: "PUT",
    headers: { "Content-Length": "0" },
  });
}

export type UpdateOwnedRepositoryInput = {
  description?: string | null;
  homepage?: string | null;
  hasIssues?: boolean;
  topics?: string[];
};

export async function fetchOwnedRepositories(
  includePrivateRepositories: boolean,
): Promise<RestStarredRepository[]> {
  const result: RestStarredRepository[] = [];
  const visibility = includePrivateRepositories ? "all" : "public";
  const { data, oauthScopes } = await requestJsonWithScopes<
    RestStarredRepository[]
  >(
    `/user/repos?affiliation=owner&visibility=${visibility}&sort=pushed&direction=desc&per_page=100&page=1`,
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
  result.push(...data);
  if (data.length < 100) return result;
  for (let page = 2; page <= 100; page += 1) {
    const batch = await requestJson<RestStarredRepository[]>(
      `/user/repos?affiliation=owner&visibility=${visibility}&sort=pushed&direction=desc&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) {
      throw createGitHubError("invalid_response", "仓库响应不是数组");
    }
    result.push(...batch);
    if (batch.length < 100) return result;
  }
  return result;
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
  const result = await requestJson<{ names?: unknown }>(
    `${repositoryPath(fullName)}/topics`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: topics }),
    },
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
  const hasMetadata =
    input.description !== undefined ||
    input.homepage !== undefined ||
    input.hasIssues !== undefined;
  let updated: RestStarredRepository | null = null;
  if (hasMetadata) {
    updated = await requestJson<RestStarredRepository>(
      repositoryPath(fullName),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.homepage !== undefined ? { homepage: input.homepage } : {}),
          ...(input.hasIssues !== undefined
            ? { has_issues: input.hasIssues }
            : {}),
        }),
      },
    );
  }
  if (input.topics !== undefined) {
    const names = await replaceOwnedRepositoryTopics(fullName, input.topics);
    if (!updated) {
      updated = await fetchRepository(fullName);
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

export async function fetchForkUpstreamComparison(
  forkFullName: string,
  forkBranch: string,
): Promise<ForkUpstreamComparison> {
  const repository = await fetchRepository(forkFullName);
  if (repository.fork !== true || !repository.parent) {
    throw createGitHubError(
      "invalid_response",
      "该仓库没有可用的 Fork 上游信息",
    );
  }
  const upstreamFullName = requiredString(
    repository.parent.full_name,
    "Fork 上游仓库名称",
  );
  const upstreamBranch = requiredString(
    repository.parent.default_branch,
    "Fork 上游默认分支",
  );
  const comparison = await compareForkWithUpstream(
    forkFullName,
    upstreamFullName,
    upstreamBranch,
    forkBranch,
  );
  return {
    upstreamFullName,
    upstreamBranch,
    aheadBy: comparisonCount(comparison.ahead_by),
    behindBy: comparisonCount(comparison.behind_by),
  };
}
