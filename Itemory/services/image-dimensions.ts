// Read encoded dimensions before UIImage decodes; reject decompression bombs early.
export function assertImageDimensions(bytes: Uint8Array): void {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0;
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[12] === 73 &&
    bytes[13] === 72 &&
    bytes[14] === 68 &&
    bytes[15] === 82
  ) {
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p++] !== 255) throw new Error("JPEG 标记无效");
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > bytes.length) break;
      const size = v.getUint16(p);
      if (size < 2 || p + size > bytes.length)
        throw new Error("JPEG 段长度无效");
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (size < 8) throw new Error("JPEG 尺寸段无效");
        height = v.getUint16(p + 3);
        width = v.getUint16(p + 5);
        break;
      }
      p += size;
    }
  }
  if (
    !width ||
    !height ||
    width * height > 24000000 ||
    width > 24000 ||
    height > 24000
  )
    throw new Error("图片尺寸无效或超过2400万像素/24000边长限制");
}
