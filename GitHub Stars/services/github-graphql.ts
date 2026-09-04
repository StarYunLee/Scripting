import { fetch, type RequestInit, type Response } from "scripting";
import { readToken } from "../auth/token";
import {
  createGitHubError,
  isRateLimitedResponse,
  responseRetryAfter,
} from "./errors";
import { retryDelayMs, wait } from "./request-retry";
import type { GitHubContributionCalendar } from "../types";

const ENDPOINT = "https://api.github.com/graphql";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type ViewerSummaryResponse = {
  viewer: {
    login: string;
    name: string | null;
    bio: string | null;
    avatarUrl: string;
    location: string | null;
    company: string | null;
    websiteUrl: string | null;
    twitterUsername: string | null;
    status: {
      emoji: string | null;
      message: string | null;
    } | null;
    followers: { totalCount: number };
    following: { totalCount: number };
    repositories: {
      totalCount: number;
      nodes: Array<{
        primaryLanguage: { name: string; color: string | null } | null;
      } | null>;
    };
    starredRepositories: { totalCount: number };
    lists: { totalCount: number };
    pinnedItems: {
      nodes: Array<{
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
    contributionsCollection: {
      contributionYears: number[];
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
  };
};

type YearContributionsResponse = {
  viewer: {
    contributionsCollection: {
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
  };
};

type ListsResponse = {
  viewer: {
    lists: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        name: string;
        description: string | null;
        isPrivate: boolean;
        createdAt: string;
        updatedAt: string;
        lastAddedAt: string;
        items: { totalCount: number };
      } | null>;
    };
  };
};

type ListItemsResponse = {
  node: {
    id: string;
    name: string;
    description: string | null;
    isPrivate: boolean;
    createdAt: string;
    updatedAt: string;
    lastAddedAt: string;
    items: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        name: string;
        nameWithOwner: string;
        description: string | null;
        url: string;
        primaryLanguage: { name: string } | null;
        stargazerCount: number;
        forkCount: number;
        pushedAt: string | null;
        updatedAt: string | null;
        owner: { login: string; avatarUrl: string };
      } | null>;
    };
  } | null;
};

const REPOSITORY_FIELDS = `
  id
  name
  nameWithOwner
  description
  url
  primaryLanguage { name }
  stargazerCount
  forkCount
  pushedAt
  updatedAt
  owner { login avatarUrl }
`;

function authHeaders(): Record<string, string> {
  const token = readToken();
  if (!token) throw createGitHubError("missing_token", "未配置 Token");
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function executeGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  retryRead = false,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await executeGraphQLOnce<T>(query, variables);
    } catch (error) {
      const delay = retryRead ? retryDelayMs(error, attempt) : null;
      if (delay === null) throw error;
      await wait(delay);
    }
  }
}

async function executeGraphQLOnce<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query, variables }),
      timeout: 30,
      debugLabel: "github-graphql",
    } satisfies RequestInit);
  } catch {
    throw createGitHubError("network", "网络请求失败");
  }
  if (!response.ok) {
    const rateLimited = isRateLimitedResponse(response);
    const kind = rateLimited
      ? "rate_limited"
      : response.status === 401
        ? "unauthorized"
        : response.status === 403
          ? "forbidden"
          : response.status >= 500
            ? "server"
            : "graphql";
    throw createGitHubError(
      kind,
      `HTTP ${response.status}`,
      response.status,
      rateLimited ? responseRetryAfter(response) : null,
    );
  }

  const raw = await response.text();
  let body: GraphQLResponse<T>;
  try {
    body = JSON.parse(raw) as GraphQLResponse<T>;
  } catch {
    throw createGitHubError(
      "invalid_response",
      "GraphQL 响应不是 JSON",
      response.status,
    );
  }
  if (body.errors?.length) {
    const message = body.errors
      .map((item) => item.message ?? "未知错误")
      .join("；");
    const rateLimited =
      isRateLimitedResponse(response) ||
      /(?:primary|secondary)?\s*rate limit/i.test(message);
    throw createGitHubError(
      rateLimited ? "rate_limited" : "graphql",
      message,
      response.status,
      rateLimited ? responseRetryAfter(response) : null,
    );
  }
  if (!body.data)
    throw createGitHubError(
      "invalid_response",
      "GraphQL data 为空",
      response.status,
    );
  return body.data;
}

export async function fetchViewerSummary(): Promise<
  ViewerSummaryResponse["viewer"]
> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const from = `${currentYear}-01-01T00:00:00Z`;
  const to = `${currentYear}-12-31T23:59:59Z`;

  const result = await executeGraphQL<ViewerSummaryResponse>(
    `query($from: DateTime, $to: DateTime) {
    viewer {
      login
      name
      bio
      avatarUrl
      location
      company
      websiteUrl
      twitterUsername
      status {
        emoji
        message
      }
      followers { totalCount }
      following { totalCount }
      repositories(ownerAffiliations: OWNER, first: 100, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
        totalCount
        nodes {
          primaryLanguage {
            name
            color
          }
        }
      }
      starredRepositories { totalCount }
      lists { totalCount }
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            ${REPOSITORY_FIELDS}
          }
        }
      }
      contributionsCollection(from: $from, to: $to) {
        contributionYears
        contributionCalendar {
          totalContributions
          colors
          weeks {
            contributionDays {
              date
              contributionCount
              color
              weekday
            }
          }
        }
      }
    }
  }`,
    { from, to },
    true,
  );
  return result.viewer;
}

export async function fetchContributionsByYear(
  year: number,
): Promise<GitHubContributionCalendar> {
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;

  const result = await executeGraphQL<YearContributionsResponse>(
    `query($from: DateTime, $to: DateTime) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          colors
          weeks {
            contributionDays {
              date
              contributionCount
              color
              weekday
            }
          }
        }
      }
    }
  }`,
    { from, to },
    true,
  );
  return result.viewer.contributionsCollection.contributionCalendar;
}

export async function fetchListSummaries(): Promise<
  NonNullable<ListsResponse["viewer"]["lists"]["nodes"][number]>[]
> {
  const all: NonNullable<ListsResponse["viewer"]["lists"]["nodes"][number]>[] =
    [];
  let cursor: string | null = null;
  do {
    const result: ListsResponse = await executeGraphQL<ListsResponse>(
      `query($cursor: String) {
      viewer {
        lists(first: 100, after: $cursor) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id name description isPrivate createdAt updatedAt lastAddedAt
            items(first: 1) { totalCount }
          }
        }
      }
    }`,
      { cursor },
      true,
    );
    all.push(
      ...result.viewer.lists.nodes.filter(
        (item): item is NonNullable<typeof item> => item !== null,
      ),
    );
    cursor = result.viewer.lists.pageInfo.hasNextPage
      ? result.viewer.lists.pageInfo.endCursor
      : null;
  } while (cursor);
  return all;
}

export type UserListMutationResult = {
  id: string;
  name: string;
};

export async function updateUserList(
  listId: string,
  name: string,
): Promise<UserListMutationResult> {
  const result = await executeGraphQL<{
    updateUserList: { list: UserListMutationResult | null };
  }>(
    `mutation($input: UpdateUserListInput!) {
      updateUserList(input: $input) { list { id name } }
    }`,
    { input: { listId, name } },
  );
  if (!result.updateUserList.list) {
    throw createGitHubError("invalid_response", "更新列表返回为空");
  }
  return result.updateUserList.list;
}

export async function deleteUserList(listId: string): Promise<void> {
  await executeGraphQL<{ deleteUserList: { clientMutationId: string | null } }>(
    `mutation($input: DeleteUserListInput!) {
      deleteUserList(input: $input) { clientMutationId }
    }`,
    { input: { listId } },
  );
}

export async function fetchListItems(
  listId: string,
  cursor: string | null = null,
): Promise<ListItemsResponse["node"]> {
  const result = await executeGraphQL<ListItemsResponse>(
    `query($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on UserList {
        id name description isPrivate createdAt updatedAt lastAddedAt
        items(first: 100, after: $cursor) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            ... on Repository {
              ${REPOSITORY_FIELDS}
            }
          }
        }
      }
    }
  }`,
    { id: listId, cursor },
    true,
  );
  return result.node;
}

export async function createUserList(
  name: string,
  description: string | null = null,
  isPrivate = false,
): Promise<UserListMutationResult> {
  const result = await executeGraphQL<{
    createUserList: { list: UserListMutationResult | null };
  }>(
    `mutation($input: CreateUserListInput!) {
      createUserList(input: $input) { list { id name } }
    }`,
    { input: { name, description, isPrivate } },
  );
  if (!result.createUserList.list) {
    throw createGitHubError("invalid_response", "创建列表返回为空");
  }
  return result.createUserList.list;
}

export async function updateUserListsForItem(
  itemId: string,
  listIds: readonly string[],
): Promise<UserListMutationResult[]> {
  const result = await executeGraphQL<{
    updateUserListsForItem: { lists: UserListMutationResult[] | null };
  }>(
    `mutation($input: UpdateUserListsForItemInput!) {
      updateUserListsForItem(input: $input) { lists { id name } }
    }`,
    { input: { itemId, listIds } },
  );
  return result.updateUserListsForItem.lists ?? [];
}
