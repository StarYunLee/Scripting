export type LoadState = "idle" | "loading" | "loaded" | "error";

export type GitHubRepository = {
  nodeId: string;
  restId: number | null;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  pushedAt: string | null;
  starredAt: string | null;
  updatedAt: string | null;
  owner: {
    login: string;
    avatarUrl: string;
  };
};

export type OwnedRepository = GitHubRepository & {
  isPrivate: boolean;
  visibility: "public" | "private" | "internal";
  isFork: boolean;
  isArchived: boolean;
  hasIssues: boolean;
  homepage: string | null;
  topics: string[];
  defaultBranch: string;
};

export type OwnedRepositoriesCache = {
  version: 1;
  repositories: OwnedRepository[];
  savedAt: string;
};

export type RepositoryPreferences = {
  version: 1;
  includePrivateRepositories: boolean;
};

export type GitHubListSummary = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  itemCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastAddedAt: string | null;
};

export type GitHubListDetail = GitHubListSummary & {
  items: GitHubRepository[];
  hasNextPage: boolean;
  endCursor: string | null;
};

export type RepositoryMembership = {
  listId: string;
  listName: string;
};

export type ResourceSyncTimestamps = {
  viewer: string | null;
  stars: string | null;
  lists: string | null;
  ownedRepositories: string | null;
  memberships: string | null;
};

export type MembershipSnapshot = {
  version: 1;
  repositories: Record<string, RepositoryMembership[]>;
  savedAt: string;
  sourceFingerprint?: string;
};

export type GitHubContributionDay = {
  date: string;
  contributionCount: number;
  color: string;
  weekday: number;
};

export type GitHubContributionWeek = {
  contributionDays: GitHubContributionDay[];
};

export type GitHubContributionCalendar = {
  totalContributions: number;
  colors: string[];
  weeks: GitHubContributionWeek[];
};

export type GitHubLanguageStat = {
  name: string;
  color: string;
  count: number;
  percentage: number;
};

export type GitHubUser = {
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
  followersCount: number;
  followingCount: number;
  publicReposCount: number;
  starredRepositoriesCount: number;
  listsCount: number;
  topLanguages?: GitHubLanguageStat[];
  pinnedRepositories?: GitHubRepository[];
  contributionYears?: number[];
  contributionsByYear?: Record<number, GitHubContributionCalendar>;
};

export type GitHubErrorKind =
  | "missing_token"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "network"
  | "graphql"
  | "server"
  | "invalid_response"
  | "unknown";

export type GitHubError = {
  kind: GitHubErrorKind;
  message: string;
  status: number | null;
  retryAfter: string | null;
};

export type AppState = {
  tokenConfigured: boolean;
  includePrivateRepositories: boolean;
  viewer: GitHubUser | null;
  stars: GitHubRepository[];
  lists: GitHubListSummary[];
  ownedRepositories: OwnedRepository[];
  memberships: MembershipSnapshot | null;
  resourceSyncedAt: ResourceSyncTimestamps;
  listDetails: Record<string, GitHubListDetail>;
  viewerState: LoadState;
  starsState: LoadState;
  listsState: LoadState;
  ownedRepositoriesState: LoadState;
  detailStates: Record<string, LoadState>;
  viewerError: GitHubError | null;
  starsError: GitHubError | null;
  listsError: GitHubError | null;
  ownedRepositoriesError: GitHubError | null;
  detailErrors: Record<string, GitHubError | null>;
  lastSyncedAt: string | null;
  hasCachedMain: boolean;
};

export type CacheEnvelope = {
  version: 1;
  viewer: GitHubUser | null;
  stars: GitHubRepository[];
  lists: GitHubListSummary[];
  savedAt: string;
  resourceSyncedAt?: ResourceSyncTimestamps;
};
