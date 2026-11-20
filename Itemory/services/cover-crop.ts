const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const OUTPUT_EDGE = 1024;

export function clampZoom(zoom: number): number {
  if (zoom < MIN_ZOOM) return MIN_ZOOM;
  if (zoom > MAX_ZOOM) return MAX_ZOOM;
  return zoom;
}

export function coverBaseScale(
  imageWidth: number,
  imageHeight: number,
  viewport: number,
): number {
  if (imageWidth < 1 || imageHeight < 1 || viewport < 1) return 1;
  return Math.max(viewport / imageWidth, viewport / imageHeight);
}

export function clampCropOffset(
  offsetX: number,
  offsetY: number,
  imageWidth: number,
  imageHeight: number,
  viewport: number,
  zoom: number,
): { x: number; y: number } {
  const scale = coverBaseScale(imageWidth, imageHeight, viewport) * clampZoom(zoom);
  const maxX = Math.max(0, (imageWidth * scale - viewport) / 2);
  const maxY = Math.max(0, (imageHeight * scale - viewport) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offsetX)),
    y: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}

export function cropSourceRect(
  imageWidth: number,
  imageHeight: number,
  viewport: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number; width: number; height: number } {
  const scale = coverBaseScale(imageWidth, imageHeight, viewport) * clampZoom(zoom);
  const displayW = imageWidth * scale;
  const displayH = imageHeight * scale;
  const imgLeft = viewport / 2 + offsetX - displayW / 2;
  const imgTop = viewport / 2 + offsetY - displayH / 2;
  let x = (0 - imgLeft) / scale;
  let y = (0 - imgTop) / scale;
  let width = viewport / scale;
  let height = viewport / scale;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + width > imageWidth) x = Math.max(0, imageWidth - width);
  if (y + height > imageHeight) y = Math.max(0, imageHeight - height);
  width = Math.min(width, imageWidth);
  height = Math.min(height, imageHeight);
  return { x, y, width, height };
}

export function applyCoverCrop(
  image: UIImage,
  viewport: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): UIImage | null {
  const source = cropSourceRect(
    image.width,
    image.height,
    viewport,
    zoom,
    offsetX,
    offsetY,
  );
  const edge = Math.min(
    OUTPUT_EDGE,
    Math.max(64, Math.round(Math.min(source.width, source.height))),
  );
  return image.renderedIn(
    { width: edge, height: edge },
    {
      position: { x: source.x, y: source.y },
      size: { width: source.width, height: source.height },
    },
  );
}

export { MIN_ZOOM, MAX_ZOOM };
