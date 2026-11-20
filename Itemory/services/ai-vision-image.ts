export const AI_VISION_IMAGE_MAX_LONG_EDGE = 2048;
export const AI_VISION_IMAGE_MAX_BASE64_CHARS = 4 * 1024 * 1024;
export type AiVisionPreparedImage = {
  dataUrl: string;
  width: number;
  height: number;
  quality: number;
  resized: boolean;
};
export function aiVisionTargetSize(
  width: number,
  height: number,
  max = AI_VISION_IMAGE_MAX_LONG_EDGE,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("图片尺寸无效");
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: scale < 1,
  };
}
export function prepareAiVisionImage(image: UIImage): AiVisionPreparedImage {
  const target = aiVisionTargetSize(image.width, image.height);
  const rendered = target.resized
    ? image.renderedIn({ width: target.width, height: target.height })
    : image;
  if (!rendered) throw new Error("图片缩放失败，请尝试其他图片");
  for (const quality of [0.82, 0.72, 0.62]) {
    const base64 = rendered.toJPEGBase64String(quality);
    if (base64 && base64.length <= AI_VISION_IMAGE_MAX_BASE64_CHARS)
      return {
        dataUrl: `data:image/jpeg;base64,${base64}`,
        width: target.width,
        height: target.height,
        quality,
        resized: target.resized,
      };
  }
  throw new Error("图片编码后仍过大，请裁剪或选择更小的图片");
}
