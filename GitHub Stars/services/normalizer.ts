import type {
  GitHubLanguageStat,
  GitHubListDetail,
  GitHubListSummary,
  GitHubRepository,
  GitHubUser,
} from "../types";
import type { RestStarredRepository, RestUser } from "./github-rest";
import type { fetchListItems } from "./github-graphql";
import { LANGUAGE_COLORS } from "../data/language-colors";

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function calculateTopLanguages(
  repos?: Array<{
    primaryLanguage?: { name?: string | null; color?: string | null } | null;
  } | null>,
): GitHubLanguageStat[] {
  if (!repos || repos.length === 0) return [];
  const counts = new Map<string, { count: number; color: string }>();
  let total = 0;

  for (const r of repos) {
    const lang = r?.primaryLanguage?.name;
    if (!lang) continue;
    total += 1;
    const color =
      r.primaryLanguage?.color || LANGUAGE_COLORS[lang] || "#858585";
    const prev = counts.get(lang);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(lang, { count: 1, color });
    }
  }

  if (total === 0) return [];

  const sorted = Array.from(counts.entries())
    .map(([name, data]) => ({
      name,
      color: data.color,
      count: data.count,
      percentage: Math.round((data.count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return sorted.slice(0, 4);
}

export function normalizeRestRepository(
  raw: RestStarredRepository,
): GitHubRepository {
  const fullName =
    stringValue(raw.full_name) ?? stringValue(raw.name) ?? "未知仓库";
  const [loginFromName] = fullName.split("/");
  return {
    nodeId:
      stringValue(raw.node_id) ?? `rest:${numberValue(raw.id)}:${fullName}`,
    restId: typeof raw.id === "number" ? raw.id : null,
    name: stringValue(raw.name) ?? fullName,
    fullName,
    description: stringValue(raw.description),
    htmlUrl: stringValue(raw.html_url) ?? `https://github.com/${fullName}`,
    language: stringValue(raw.language),
    stargazersCount: numberValue(raw.stargazers_count),
    forksCount: numberValue(raw.forks_count),
    pushedAt: stringValue(raw.pushed_at),
    starredAt: stringValue(raw.starred_at),
    updatedAt: stringValue(raw.updated_at),
    owner: {
      login: stringValue(raw.owner?.login) ?? loginFromName ?? "未知用户",
      avatarUrl: stringValue(raw.owner?.avatar_url) ?? "",
    },
  };
}

export function normalizeViewer(
  raw: RestUser,
  summary: {
    location?: string | null;
    company?: string | null;
    websiteUrl?: string | null;
    twitterUsername?: string | null;
    status?: {
      emoji: string | null;
      message: string | null;
    } | null;
    followers?: { totalCount: number };
    following?: { totalCount: number };
    repositories?: {
      totalCount: number;
      nodes?: Array<{
        primaryLanguage?: {
          name?: string | null;
          color?: string | null;
        } | null;
      } | null>;
    };
    starredRepositories: { totalCount: number };
    lists: { totalCount: number };
    pinnedItems?: {
      nodes?: Array<{
        id?: string;
        name?: string;
        nameWithOwner?: string;
        description?: string | null;
        url?: string;
        primaryLanguage?: { name: string } | null;
        stargazerCount?: number;
        forkCount?: number;
        pushedAt?: string | null;
        updatedAt?: string | null;
        owner?: { login: string; avatarUrl: string };
      } | null>;
    };
    contributionsCollection?: {
      contributionYears?: number[];
      contributionCalendar: {
        totalContributions: number;
        colors: string[];
        weeks: Array<{
          contributionDays: Array<{
            date: string;
            contributionCount: number;
            color: string;
            weekday: number;
          }>;
        }>;
      };
    };
  },
): GitHubUser {
  const currentYear = new Date().getFullYear();
  const calendar =
    summary.contributionsCollection?.contributionCalendar ?? null;

  return {
    login: stringValue(raw.login) ?? "",
    name: stringValue(raw.name),
    bio: stringValue(raw.bio),
    avatarUrl: stringValue(raw.avatar_url) ?? "",
    location: stringValue(summary.location) ?? stringValue(raw.location),
    company: stringValue(summary.company) ?? stringValue(raw.company),
    websiteUrl: stringValue(summary.websiteUrl) ?? stringValue(raw.blog),
    twitterUsername:
      stringValue(summary.twitterUsername) ?? stringValue(raw.twitter_username),
    status: summary.status ?? null,
    followersCount: summary.followers?.totalCount ?? numberValue(raw.followers),
    followingCount: summary.following?.totalCount ?? numberValue(raw.following),
    publicReposCount:
      summary.repositories?.totalCount ?? numberValue(raw.public_repos),
    starredRepositoriesCount: summary.starredRepositories.totalCount,
    listsCount: summary.lists.totalCount,
    topLanguages: calculateTopLanguages(summary.repositories?.nodes),
    pinnedRepositories: (summary.pinnedItems?.nodes ?? [])
      .filter(
        (
          item,
        ): item is NonNullable<typeof item> & {
          id: string;
          name: string;
          nameWithOwner: string;
          url: string;
          owner: { login: string; avatarUrl: string };
        } =>
          Boolean(
            item?.id &&
              item.name &&
              item.nameWithOwner &&
              item.url &&
              item.owner,
          ),
      )
      .map((item) =>
        normalizeGraphQLRepository({
          id: item.id,
          name: item.name,
          nameWithOwner: item.nameWithOwner,
          description: item.description ?? null,
          url: item.url,
          primaryLanguage: item.primaryLanguage ?? null,
          stargazerCount: item.stargazerCount ?? 0,
          forkCount: item.forkCount ?? 0,
          pushedAt: item.pushedAt ?? null,
          updatedAt: item.updatedAt ?? null,
          owner: item.owner,
        }),
      ),
    contributionYears: summary.contributionsCollection?.contributionYears ?? [
      currentYear,
    ],
    contributionsByYear: calendar ? { [currentYear]: calendar } : {},
  };
}

export function normalizeListSummary(raw: {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  lastAddedAt: string;
  items: { totalCount: number };
}): GitHubListSummary {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    isPrivate: raw.isPrivate,
    itemCount: raw.items.totalCount,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastAddedAt: raw.lastAddedAt,
  };
}

type ListItemsNode = NonNullable<Awaited<ReturnType<typeof fetchListItems>>>;
type GraphQLRepository = NonNullable<ListItemsNode["items"]["nodes"][number]>;

export function normalizeGraphQLRepository(
  raw: GraphQLRepository,
): GitHubRepository {
  return {
    nodeId: raw.id,
    restId: null,
    name: raw.name,
    fullName: raw.nameWithOwner,
    description: raw.description,
    htmlUrl: raw.url,
    language: raw.primaryLanguage?.name ?? null,
    stargazersCount: raw.stargazerCount,
    forksCount: raw.forkCount,
    pushedAt: raw.pushedAt,
    starredAt: null,
    updatedAt: raw.updatedAt,
    owner: raw.owner,
  };
}

export function normalizeListDetail(
  raw: ListItemsNode,
  existing: GitHubListDetail | null,
): GitHubListDetail {
  const items = raw.items.nodes
    .filter((item): item is GraphQLRepository => item !== null)
    .map(normalizeGraphQLRepository);
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    isPrivate: raw.isPrivate,
    itemCount: raw.items.totalCount,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastAddedAt: raw.lastAddedAt,
    items: existing ? [...existing.items, ...items] : items,
    hasNextPage: raw.items.pageInfo.hasNextPage,
    endCursor: raw.items.pageInfo.endCursor,
  };
}
