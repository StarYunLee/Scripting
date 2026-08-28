import { loadImageFromUrls } from "./imageDownload";
import { buildFilename, splitFilename } from "./names";

export async function exportPngFile(options: {
  filename: string;
  data?: Data;
  urls?: string[];
}): Promise<"shared" | "cancelled"> {
  let data = options.data ?? null;
  if (!data) {
    if (!options.urls?.length) {
      throw new Error("没有可导出的图片");
    }
    const image = await loadImageFromUrls(options.urls, "导出失败");
    data = image.toPNGData();
  }
  if (!data) {
    throw new Error("无法将图标转换为 PNG");
  }

  const parsed = splitFilename(options.filename);
  const filename = buildFilename(parsed.name || "icon", ".png");
  const path = `${FileManager.temporaryDirectory}/${filename}`;

  try {
    if (await FileManager.exists(path)) {
      await FileManager.remove(path);
    }
    await FileManager.writeAsData(path, data);
    const completed = await ShareSheet.present([path]);
    return completed ? "shared" : "cancelled";
  } finally {
    try {
      if (await FileManager.exists(path)) {
        await FileManager.remove(path);
      }
    } catch {
      /* 分享结束后尽量清掉临时文件 */
    }
  }
}
