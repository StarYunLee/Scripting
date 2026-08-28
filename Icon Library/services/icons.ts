import { clearPendingUpload, markPendingUpload } from "./catalog";
import {
  commitFiles,
  deleteFile,
  getFileMeta,
  prefersPatChannel,
  putFile,
  readBinaryFile,
} from "./github";
import type { RepoContext } from "./models";
import { iconPath } from "./settings";
import { assertCanWriteGithub } from "./writeAccess";

const MAX_BYTES = 900 * 1024;

export async function uploadIcon(options: {
  context: RepoContext;
  filename: string;
  data: Data;
  overwrite: boolean;
}): Promise<void> {
  const { context, filename, data, overwrite } = options;
  const { profileId, settings } = context;
  assertCanWriteGithub(profileId);
  if (data.size > MAX_BYTES) {
    throw new Error(`文件过大（${data.size} 字节），GitHub Contents API 建议小于 1MB`);
  }

  const repoPath = iconPath(settings, filename);
  const existing = await getFileMeta(context, repoPath);
  if (existing && !overwrite) {
    throw new Error(`${filename} 已存在`);
  }

  await putFile({
    context,
    repoPath,
    message: existing
      ? `chore(icon): update ${filename}`
      : `chore(icon): add ${filename}`,
    data,
    sha: existing?.sha,
  });
  markPendingUpload(settings, filename, filename.replace(/\.[^.]+$/, ""));
}

export async function deleteIcon(options: {
  context: RepoContext;
  filename: string;
  sha?: string;
}): Promise<void> {
  const { context, filename } = options;
  const { profileId, settings } = context;
  assertCanWriteGithub(profileId);
  const repoPath = iconPath(settings, filename);
  const existing = options.sha
    ? { sha: options.sha, path: repoPath, size: 0, downloadUrl: null }
    : await getFileMeta(context, repoPath);
  if (!existing) {
    throw new Error(
      `${filename} 在仓库里找不到。可能是凭证读不到该文件，或索引里的名字和实际路径不一致。`,
    );
  }
  await deleteFile({
    context,
    repoPath,
    message: `chore(icon): delete ${filename}`,
    sha: existing.sha,
  });
  clearPendingUpload(settings, filename);
}

export async function renameIcon(options: {
  context: RepoContext;
  fromFilename: string;
  toFilename: string;
}): Promise<void> {
  const { context, fromFilename, toFilename } = options;
  const { profileId, settings } = context;
  assertCanWriteGithub(profileId);
  if (fromFilename === toFilename) {
    return;
  }

  const target = await getFileMeta(context, iconPath(settings, toFilename));
  if (target) {
    throw new Error(`${toFilename} 已存在`);
  }

  const data = await readBinaryFile(context, iconPath(settings, fromFilename));
  await putFile({
    context,
    repoPath: iconPath(settings, toFilename),
    message: `chore(icon): rename ${fromFilename} to ${toFilename}`,
    data,
  });

  try {
    await deleteIcon({ context, filename: fromFilename });
  } catch (error) {
    throw new Error(
      `已写入 ${toFilename}，但删除旧文件失败：${String(error)}。请手动清理 ${fromFilename}。`,
    );
  }
  markPendingUpload(settings, toFilename, toFilename.replace(/\.[^.]+$/, ""));
}

export async function deleteIcons(options: {
  context: RepoContext;
  filenames: string[];
}): Promise<void> {
  const { context, filenames } = options;
  const { profileId, settings } = context;
  const unique = [...new Set(filenames.filter(Boolean))];
  if (unique.length === 0) {
    return;
  }
  assertCanWriteGithub(profileId);

  if (unique.length === 1 || !prefersPatChannel(profileId)) {
    for (const filename of unique) {
      await deleteIcon({ context, filename });
    }
    return;
  }

  await commitFiles({
    context,
    message: `chore(icon): delete ${unique.length} icons`,
    deletions: unique.map((filename) => iconPath(settings, filename)),
  });
  for (const filename of unique) {
    clearPendingUpload(settings, filename);
  }
}

export async function uploadIcons(options: {
  context: RepoContext;
  files: Array<{ filename: string; data: Data }>;
}): Promise<void> {
  const { context, files } = options;
  const { profileId, settings } = context;
  if (files.length === 0) {
    return;
  }
  assertCanWriteGithub(profileId);
  for (const file of files) {
    if (file.data.size > MAX_BYTES) {
      throw new Error(
        `${file.filename} 过大（${file.data.size} 字节），建议小于 1MB`,
      );
    }
  }

  if (files.length === 1 || !prefersPatChannel(profileId)) {
    for (const file of files) {
      await uploadIcon({
        context,
        filename: file.filename,
        data: file.data,
        overwrite: true,
      });
    }
    return;
  }

  await commitFiles({
    context,
    message:
      files.length === 1
        ? `chore(icon): add ${files[0].filename}`
        : `chore(icon): add ${files.length} icons`,
    files: files.map((file) => ({
      path: iconPath(settings, file.filename),
      data: file.data,
    })),
  });
  for (const file of files) {
    markPendingUpload(
      settings,
      file.filename,
      file.filename.replace(/\.[^.]+$/, ""),
    );
  }
}
