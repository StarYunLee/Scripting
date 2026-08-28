import { Path } from "scripting";
import { nextId } from "./id";
import type { UploadDraft } from "./models";
import { buildFilename, normalizeExtension, sanitizeIconName, splitFilename } from "./names";

function draftFromImage(image: UIImage, suggestedName: string): UploadDraft {
  const data = image.toPNGData();
  if (!data) {
    throw new Error("无法将图片转换为 PNG");
  }
  const filename = buildFilename(suggestedName, ".png");
  return {
    id: nextId("draft"),
    name: splitFilename(filename).name,
    filename,
    data,
    preview: image,
    byteSize: data.size,
  };
}

function draftFromFile(path: string): UploadDraft {
  const parsed = splitFilename(Path.basename(path));
  const ext = parsed.ext || ".png";
  const name = sanitizeIconName(parsed.name) || "icon";
  const filename = buildFilename(name, ext);
  const data = Data.fromFile(path);
  if (!data) {
    throw new Error(`无法读取文件：${Path.basename(path)}`);
  }
  return {
    id: nextId("draft"),
    name,
    filename,
    data,
    preview: UIImage.fromFile(path),
    byteSize: data.size,
  };
}

export async function pickPhotosAsDrafts(): Promise<UploadDraft[]> {
  const results = await Photos.pick({
    filter: PHPickerFilter.images(),
    limit: 8,
  });
  const drafts: UploadDraft[] = [];
  for (const [index, result] of results.entries()) {
    const image = await result.uiImage();
    if (!image) {
      continue;
    }
    drafts.push(draftFromImage(image, `icon-${index + 1}`));
  }
  return drafts;
}

export async function pickFilesAsDrafts(): Promise<UploadDraft[]> {
  const paths = await DocumentPicker.pickFiles({
    allowsMultipleSelection: true,
    types: ["public.image", "public.png", "public.jpeg", "public.svg-image"],
  });
  return paths.map((path) => draftFromFile(path));
}

export function renameDraft(draft: UploadDraft, nextName: string): UploadDraft {
  const ext = normalizeExtension(splitFilename(draft.filename).ext) || ".png";
  const filename = buildFilename(nextName, ext);
  return {
    ...draft,
    name: splitFilename(filename).name,
    filename,
  };
}
