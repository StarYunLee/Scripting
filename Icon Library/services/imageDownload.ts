/** 按顺序尝试 URL，返回第一张成功的图片。 */
export async function loadImageFromUrls(
  urls: string[],
  failurePrefix = "下载图标失败",
): Promise<UIImage> {
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const image = await UIImage.fromURL(url);
      if (image) {
        return image;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    lastError instanceof Error
      ? `${failurePrefix}：${lastError.message}`
      : `${failurePrefix}：无法获取图片`,
  );
}
