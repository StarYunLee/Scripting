export type LibraryMode = "unconfigured" | "create" | "connect";

export type IconLibrarySettings = {
  owner: string;
  repo: string;
  branch: string;
  iconDir: string;
  jsonPath: string;
  mode: LibraryMode;
};

export type RepoContext = {
  profileId: string;
  settings: IconLibrarySettings;
};

export type CatalogIcon = {
  name: string;
  filename: string;
  url: string;
  sha?: string;
  pending?: boolean;
};

export type CatalogSnapshot = {
  title: string;
  description: string;
  icons: CatalogIcon[];
  fetchedAt: number;
  source: "github" | "raw" | "directory" | "cache";
  indexMissing?: boolean;
};

export type PendingUpload = {
  name: string;
  filename: string;
  createdAt: number;
};

export type UploadDraft = {
  id: string;
  name: string;
  filename: string;
  data: Data;
  preview: UIImage | null;
  byteSize: number;
};

export type GithubAvailabilityState = {
  hasPat: boolean;
  summary: string;
};

export type RepoEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
  size: number;
  downloadUrl: string | null;
};

export type RemoteLibrary = {
  id: string;
  title: string;
  jsonUrl: string;
  addedAt: number;
};

export type RemoteLibraryStore = {
  libraries: RemoteLibrary[];
  currentId: string | null;
};

export type RepoProfile = {
  id: string;
  label: string;
  settings: IconLibrarySettings;
};

export type RepoProfileStore = {
  profiles: RepoProfile[];
  activeId: string | null;
};
