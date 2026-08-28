import {
  getFileMeta,
  listPath,
  pathExists,
  putTextFile,
} from "./github";
import type { IconLibrarySettings, RepoContext, RepoEntry } from "./models";
import { isAllowedExtension, splitFilename } from "./names";
import {
  STANDARD_WORKFLOW_PATH,
  STANDARD_WORKFLOW_SCRIPT_PATH,
  isRepoConfigured,
  rawFileUrl,
  sanitizeRepoPathSegment,
} from "./settings";
import {
  buildGenerateIconsScript,
  buildGenerateIconsWorkflow,
  emptyCatalogJson,
} from "./workflowTemplate";

export async function listRootEntries(
  context: RepoContext,
): Promise<RepoEntry[]> {
  const { settings } = context;
  if (!isRepoConfigured(settings)) {
    throw new Error("尚未配置仓库");
  }
  const entries = await listPath(context, "");
  return entries ?? [];
}

export async function listJsonCandidates(
  context: RepoContext,
): Promise<RepoEntry[]> {
  const root = await listRootEntries(context);
  const found: RepoEntry[] = root.filter(
    (item) => item.type === "file" && item.name.toLowerCase().endsWith(".json"),
  );

  const nestedDirs = root.filter(
    (item) =>
      item.type === "dir" &&
      !item.name.startsWith(".") &&
      item.name.toLowerCase() !== "node_modules",
  );
  const nested = await Promise.all(
    nestedDirs.map(async (dir) => {
      const children = (await listPath(context, dir.path)) ?? [];
      return children.filter(
        (item) =>
          item.type === "file" && item.name.toLowerCase().endsWith(".json"),
      );
    }),
  );
  return [...found, ...nested.flat()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
}

export async function listDirCandidates(
  context: RepoContext,
): Promise<RepoEntry[]> {
  const root = await listRootEntries(context);
  return root.filter((item) => item.type === "dir" && !item.name.startsWith("."));
}

export async function hasStandardWorkflow(
  context: RepoContext,
): Promise<boolean> {
  return (await getFileMeta(context, STANDARD_WORKFLOW_PATH)) != null;
}

export async function createIconLibrary(options: {
  context: RepoContext;
  iconDir: string;
  jsonPath: string;
  overwriteStandard?: boolean;
}): Promise<IconLibrarySettings> {
  const { context } = options;
  const iconDir = sanitizeRepoPathSegment(options.iconDir, "icon");
  const jsonPath = sanitizeRepoPathSegment(options.jsonPath, "icons.json");
  const next: IconLibrarySettings = {
    ...context.settings,
    iconDir,
    jsonPath,
    mode: "create",
  };

  const nextContext: RepoContext = { ...context, settings: next };

  const workflowExists = await pathExists(nextContext, STANDARD_WORKFLOW_PATH);
  const scriptExists = await pathExists(nextContext, STANDARD_WORKFLOW_SCRIPT_PATH);
  const jsonExists = await pathExists(nextContext, jsonPath);
  if ((workflowExists || scriptExists || jsonExists) && !options.overwriteStandard) {
    throw new Error(
      "仓库里已有标准索引或 workflow。如要覆盖请确认；否则请改用「连接已有图标库」。",
    );
  }

  const keepPath = `${iconDir}/.gitkeep`;
  if (!(await pathExists(nextContext, keepPath))) {
    await putTextFile({
      context: nextContext,
      repoPath: keepPath,
      message: `chore(icons): create ${iconDir} directory`,
      text: "",
    });
  }

  const existingJson = await getFileMeta(nextContext, jsonPath);
  await putTextFile({
    context: nextContext,
    repoPath: jsonPath,
    message: existingJson
      ? `chore(icons): reset ${jsonPath}`
      : `chore(icons): create ${jsonPath}`,
    text: emptyCatalogJson(next),
    sha: existingJson?.sha,
  });

  const existingWorkflow = await getFileMeta(nextContext, STANDARD_WORKFLOW_PATH);
  await putTextFile({
    context: nextContext,
    repoPath: STANDARD_WORKFLOW_PATH,
    message: "chore(icons): add generate-icons workflow",
    text: buildGenerateIconsWorkflow(next),
    sha: existingWorkflow?.sha,
  });

  const existingScript = await getFileMeta(nextContext, STANDARD_WORKFLOW_SCRIPT_PATH);
  await putTextFile({
    context: nextContext,
    repoPath: STANDARD_WORKFLOW_SCRIPT_PATH,
    message: "chore(icons): add generate-icons script",
    text: buildGenerateIconsScript(next),
    sha: existingScript?.sha,
  });

  return next;
}

export async function connectIconLibrary(options: {
  context: RepoContext;
  iconDir: string;
  jsonPath: string;
}): Promise<IconLibrarySettings> {
  const iconDir = sanitizeRepoPathSegment(options.iconDir, "icon");
  const jsonPath = sanitizeRepoPathSegment(options.jsonPath, "icons.json");
  const next: IconLibrarySettings = {
    ...options.context.settings,
    iconDir,
    jsonPath,
    mode: "connect",
  };
  return next;
}

export async function rebuildIndexFromDirectory(
  context: RepoContext,
): Promise<void> {
  const { settings } = context;
  const entries = (await listPath(context, settings.iconDir)) ?? [];
  const icons = entries
    .filter((item) => item.type === "file")
    .filter((item) => isAllowedExtension(splitFilename(item.name).ext || ""))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((item) => ({
      name: splitFilename(item.name).name,
      url: rawFileUrl(settings, item.path),
    }));

  const payload = `${JSON.stringify(
    {
      name: `${settings.owner}/${settings.repo}`,
      description: "Generated icon index",
      icons,
    },
    null,
    2,
  )}\n`;

  const existing = await getFileMeta(context, settings.jsonPath);
  await putTextFile({
    context,
    repoPath: settings.jsonPath,
    message: "chore(icons): update generated index",
    text: payload,
    sha: existing?.sha,
  });
  const confirmed = await getFileMeta(context, settings.jsonPath);
  if (!confirmed) {
    throw new Error("索引已提交，但未能从仓库读回，请稍后重试。");
  }
}
