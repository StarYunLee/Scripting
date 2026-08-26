import { fetch, type RequestInit, type Response } from "scripting";
import { readToken } from "../auth/token";
import { createGitHubError } from "./errors";

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

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
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
    const kind =
      response.status === 401
        ? "unauthorized"
        : response.status === 403
          ? "forbidden"
          : response.status === 404
            ? "not_found"
            : response.status === 429
              ? "rate_limited"
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
    throw createGitHubError(kind, mappedMessage, response.status, null);
  }
  return { status: response.status, body };
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
  try {
    if (/^https?:\/\//i.test(withoutPrefix)) {
      const url = new URL(withoutPrefix);
      if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
      const [owner, repo] = url.pathname.split("/").filter(Boolean);
      if (!owner || !repo) return null;
      return `${owner}/${repo.replace(/\.git$/i, "")}`;
    }
  } catch {
    return null;
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

export async function fetchRepository(
  fullName: string,
): Promise<RestStarredRepository> {
  const [owner, repo, ...rest] = fullName.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw createGitHubError("invalid_response", "仓库名称无效");
  }
  return requestJson<RestStarredRepository>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
}
