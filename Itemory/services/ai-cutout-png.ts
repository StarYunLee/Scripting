/**
 * ai-cutout-png.ts
 *
 * 纯 TS 实现的 PNG 透明像素离线检查器。
 * 遵循 RFC 2083 (PNG) 与 RFC 1951 (DEFLATE) 标准，具备严格的有界内存与解压防御能力。
 */

export const AI_CUTOUT_PNG_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB 文件体积上限
// Independent CPU gates: tiny images can still contain thousands of empty blocks.
export const AI_CUTOUT_DEFLATE_MAX_BLOCKS = 4096;
export const AI_CUTOUT_DEFLATE_MAX_WORK = 160 * 1024 * 1024;

export type CutoutPngInfo = {
  width: number;
  height: number;
  transparentPixels: number;
  visiblePixels: number;
  totalPixels: number;
};

// CRC-32 查找表与计算
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function calcCrc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function readUInt32BE(buf: Uint8Array, offset: number): number {
  return (
    (((buf[offset] << 24) >>> 0) |
      (buf[offset + 1] << 16) |
      (buf[offset + 2] << 8) |
      buf[offset + 3]) >>>
    0
  );
}

// RFC 1951 Deflate 编码表
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA_BITS = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
];
const CL_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

// 规范 Huffman 树解码生成器 (RFC 1951 3.2.2 规范前缀码反转构建)
function buildHuffmanTree(
  lengths: Uint8Array | number[],
): (readBit: () => number) => number {
  let maxBits = 0;
  for (let i = 0; i < lengths.length; i++)
    if (lengths[i] > maxBits) maxBits = lengths[i];
  if (maxBits === 0)
    return () => {
      throw new Error("空 Huffman 树无法解码");
    };

  const blCount = new Uint16Array(maxBits + 1);
  for (let i = 0; i < lengths.length; i++)
    if (lengths[i] > 0) blCount[lengths[i]]++;

  let left = 1;
  for (let bits = 1; bits <= maxBits; bits++) {
    left = (left << 1) - blCount[bits];
    if (left < 0) throw new Error("Huffman 编码表过度分配");
  }
  let code = 0;
  const nextCode = new Uint16Array(maxBits + 1);
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + blCount[bits - 1]) << 1;
    nextCode[bits] = code;
  }

  // 二叉树节点：0 为根节点，正数为子节点，负数 -(sym + 2) 为叶子符号
  const tree: [number, number][] = [[-1, -1]];
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym];
    if (len === 0) continue;
    let codeVal = nextCode[len]++;
    let nodeIdx = 0;
    for (let b = len - 1; b >= 0; b--) {
      const bit = (codeVal >>> b) & 1;
      if (b === 0) {
        if (tree[nodeIdx][bit] !== -1)
          throw new Error("Huffman 树结构冲突 (重复前缀)");
        tree[nodeIdx][bit] = -(sym + 2);
      } else {
        let child = tree[nodeIdx][bit];
        if (child === -1) {
          child = tree.length;
          tree.push([-1, -1]);
          tree[nodeIdx][bit] = child;
        } else if (child < -1) {
          throw new Error("Huffman 树结构冲突 (前缀重叠)");
        }
        nodeIdx = child;
      }
    }
  }

  return (readBit: () => number): number => {
    let nodeIdx = 0;
    while (true) {
      const bit = readBit();
      const next = tree[nodeIdx][bit];
      if (next === -1) throw new Error("非法 Huffman 编码序列");
      if (next < -1) return -(next + 2);
      nodeIdx = next;
    }
  };
}

// 预构建 RFC 1951 固定 Huffman 树
const FIXED_LIT_LENGTHS = new Uint8Array(288);
for (let i = 0; i <= 143; i++) FIXED_LIT_LENGTHS[i] = 8;
for (let i = 144; i <= 255; i++) FIXED_LIT_LENGTHS[i] = 9;
for (let i = 256; i <= 279; i++) FIXED_LIT_LENGTHS[i] = 7;
for (let i = 280; i <= 287; i++) FIXED_LIT_LENGTHS[i] = 8;
const decodeFixedLitTree = buildHuffmanTree(FIXED_LIT_LENGTHS);

const FIXED_DIST_LENGTHS = new Uint8Array(32);
for (let i = 0; i < 32; i++) FIXED_DIST_LENGTHS[i] = 5;
const decodeFixedDistTree = buildHuffmanTree(FIXED_DIST_LENGTHS);

/**
 * 最小标准有界 Deflate/zlib 解压器
 * 严格按照 expectedLen 预分配并限制输出长度，每步输出均执行边界拦截
 */
function boundedInflate(
  zlibBytes: Uint8Array,
  expectedLen: number,
): Uint8Array {
  const inLen = zlibBytes.length;
  if (inLen < 6) throw new Error("zlib 数据长度过短 (损坏的 IDAT)");

  const cmf = zlibBytes[0];
  const flg = zlibBytes[1];
  if (((cmf << 8) + flg) % 31 !== 0)
    throw new Error("zlib 头部校验失败 (FCHECK 错误)");
  const cm = cmf & 0x0f;
  if (cm !== 8)
    throw new Error(`不支持的 zlib 压缩方法: ${cm} (仅支持 deflate)`);
  const cinfo = (cmf >>> 4) & 0x0f;
  if (cinfo > 7) throw new Error(`不支持的 zlib 窗口大小: ${cinfo}`);
  if (flg & 0x20) throw new Error("不支持 preset dictionary (FDICT)");

  let inBitPos = 16; // 跳过 CMF 和 FLG
  let blocks = 0;
  let work = 0;
  function spend(units: number) {
    work += units;
    if (work > AI_CUTOUT_DEFLATE_MAX_WORK)
      throw new Error("Deflate 工作量超过安全预算");
  }

  function readBit(): number {
    spend(1);
    const bytePos = inBitPos >>> 3;
    if (bytePos >= inLen - 4) throw new Error("Deflate 数据流截断");
    const bit = (zlibBytes[bytePos] >>> (inBitPos & 7)) & 1;
    inBitPos++;
    return bit;
  }

  function readBits(n: number): number {
    let res = 0;
    for (let i = 0; i < n; i++) res |= readBit() << i;
    return res;
  }

  const out = new Uint8Array(expectedLen);
  let outPos = 0;
  let isFinal = 0;

  while (!isFinal) {
    if (++blocks > AI_CUTOUT_DEFLATE_MAX_BLOCKS)
      throw new Error("Deflate block 数超过安全预算");
    spend(1024); // Includes bounded table construction cost per block.
    isFinal = readBit();
    const btype = readBits(2);

    if (btype === 0) {
      // 00: 非压缩块 (Stored)
      const rem = inBitPos & 7;
      if (rem !== 0) readBits(8 - rem); // 对齐字节边界
      const byteStart = inBitPos >>> 3;
      if (byteStart + 4 > inLen - 4) throw new Error("非压缩块标头截断");
      const len = zlibBytes[byteStart] | (zlibBytes[byteStart + 1] << 8);
      const nlen = zlibBytes[byteStart + 2] | (zlibBytes[byteStart + 3] << 8);
      if ((len ^ 0xffff) !== nlen)
        throw new Error("非压缩块长度校验失败 (LEN/NLEN 不匹配)");
      inBitPos = (byteStart + 4 + len) * 8;
      if (byteStart + 4 + len > inLen - 4)
        throw new Error("非压缩块有效载荷截断");
      if (outPos + len > expectedLen)
        throw new Error("解压输出超过预期上限 (膨胀防御拦截)");
      spend(len);
      out.set(zlibBytes.subarray(byteStart + 4, byteStart + 4 + len), outPos);
      outPos += len;
    } else if (btype === 1 || btype === 2) {
      // 01: 固定 Huffman; 10: 动态 Huffman
      let decodeLit: (rb: () => number) => number;
      let decodeDist: (rb: () => number) => number;

      if (btype === 1) {
        decodeLit = decodeFixedLitTree;
        decodeDist = decodeFixedDistTree;
      } else {
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;

        const codeLengthsLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++)
          codeLengthsLengths[CL_ORDER[i]] = readBits(3);
        const decodeCodeLength = buildHuffmanTree(codeLengthsLengths);

        const totalLengthsToRead = hlit + hdist;
        const dynamicLengths = new Uint8Array(totalLengthsToRead);
        let idx = 0;
        while (idx < totalLengthsToRead) {
          const sym = decodeCodeLength(readBit);
          if (sym < 16) {
            dynamicLengths[idx++] = sym;
          } else if (sym === 16) {
            if (idx === 0) throw new Error("动态 Huffman 前导重复错误");
            const repeat = readBits(2) + 3;
            const prev = dynamicLengths[idx - 1];
            if (idx + repeat > totalLengthsToRead)
              throw new Error("动态 Huffman 重复长度越界");
            for (let r = 0; r < repeat; r++) dynamicLengths[idx++] = prev;
          } else if (sym === 17) {
            const repeat = readBits(3) + 3;
            if (idx + repeat > totalLengthsToRead)
              throw new Error("动态 Huffman 重复长度越界");
            for (let r = 0; r < repeat; r++) dynamicLengths[idx++] = 0;
          } else if (sym === 18) {
            const repeat = readBits(7) + 11;
            if (idx + repeat > totalLengthsToRead)
              throw new Error("动态 Huffman 重复长度越界");
            for (let r = 0; r < repeat; r++) dynamicLengths[idx++] = 0;
          } else {
            throw new Error(`未知动态 Huffman 代码长度符号: ${sym}`);
          }
        }

        if (hlit > 286) throw new Error("非法动态 Huffman 字面量数量");
        if (!dynamicLengths[256]) throw new Error("动态 Huffman 缺少结束符");
        decodeLit = buildHuffmanTree(dynamicLengths.subarray(0, hlit));
        decodeDist = buildHuffmanTree(
          dynamicLengths.subarray(hlit, hlit + hdist),
        );
      }

      while (true) {
        const sym = decodeLit(readBit);
        if (sym < 256) {
          if (outPos >= expectedLen)
            throw new Error("解压输出超过预期上限 (膨胀防御拦截)");
          out[outPos++] = sym;
        } else if (sym === 256) {
          break; // 块结束
        } else {
          // 长度-距离对解码与回溯复制
          const lenCode = sym - 257;
          if (lenCode >= LENGTH_BASE.length)
            throw new Error(`非法匹配长度编码: ${sym}`);
          const extraLenBits = LENGTH_EXTRA_BITS[lenCode];
          const matchLen =
            LENGTH_BASE[lenCode] +
            (extraLenBits > 0 ? readBits(extraLenBits) : 0);

          const distSym = decodeDist(readBit);
          if (distSym >= DIST_BASE.length)
            throw new Error(`非法匹配距离编码: ${distSym}`);
          const extraDistBits = DIST_EXTRA_BITS[distSym];
          const dist =
            DIST_BASE[distSym] +
            (extraDistBits > 0 ? readBits(extraDistBits) : 0);

          if (dist > outPos || dist > 1 << (cinfo + 8))
            throw new Error(
              `回溯距离超过已输出边界或窗口: 距离 ${dist} > 当前偏移 ${outPos}`,
            );
          if (outPos + matchLen > expectedLen)
            throw new Error("解压输出超过预期上限 (膨胀防御拦截)");

          spend(matchLen);
          let srcPos = outPos - dist;
          for (let m = 0; m < matchLen; m++) out[outPos++] = out[srcPos++];
        }
      }
    } else {
      throw new Error(`未知 Deflate 块类型: ${btype}`);
    }
  }

  if (Math.ceil(inBitPos / 8) !== inLen - 4)
    throw new Error("zlib 压缩流包含异常尾部数据");
  if (outPos !== expectedLen) {
    throw new Error(
      `解压输出长度 (${outPos}) 与预期像素扫描行长度 (${expectedLen}) 不符`,
    );
  }

  // 校验 Adler-32
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < expectedLen; i++) {
    s1 = (s1 + out[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const calcAdler = ((s2 << 16) | s1) >>> 0;
  const expectedAdler = readUInt32BE(zlibBytes, inLen - 4);
  if (calcAdler !== expectedAdler) {
    throw new Error(
      `zlib Adler-32 校验失败: 计算值 0x${calcAdler.toString(16)} vs 期望值 0x${expectedAdler.toString(16)}`,
    );
  }

  return out;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * 校验并扫描有界 PNG 透明像素
 */
export function inspectCutoutPng(bytes: Uint8Array): CutoutPngInfo {
  if (!bytes || !(bytes instanceof Uint8Array))
    throw new Error("输入数据无效: 必须为 Uint8Array");
  if (bytes.length > AI_CUTOUT_PNG_MAX_BYTES) {
    throw new Error(`PNG 文件大小超过上限: ${bytes.length} 字节 > 8MiB 限制`);
  }
  if (bytes.length < 8 + 25 + 12)
    throw new Error("PNG 数据过短，无法包含完整必要元数据");

  // 1. 签名校验
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error("非法的 PNG 文件头签名");
  }

  let offset = 8;
  let ihdrFound = false;
  let iendFound = false;
  let idatEnded = false;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let plteFound = false;
  let bpp = 0;
  const idatBuffers: Uint8Array[] = [];
  let totalIdatBytes = 0;
  let chunkCount = 0;

  const MAX_CHUNKS = 1000;

  while (offset < bytes.length) {
    chunkCount++;
    if (chunkCount > MAX_CHUNKS)
      throw new Error(`PNG 包含异常过多的 chunk 数据块 (> ${MAX_CHUNKS})`);
    if (offset + 8 > bytes.length) throw new Error("PNG chunk 头部截断");

    const chunkLen = readUInt32BE(bytes, offset);
    offset += 4;
    const chunkTypeBytes = bytes.subarray(offset, offset + 4);
    if (
      !chunkTypeBytes.every(
        (value) =>
          (value >= 65 && value <= 90) || (value >= 97 && value <= 122),
      ) ||
      chunkTypeBytes[2] & 0x20
    )
      throw new Error("PNG chunk 名称非法或保留位不符合规范");
    const chunkType = String.fromCharCode(...chunkTypeBytes);
    offset += 4;

    if (offset + chunkLen + 4 > bytes.length)
      throw new Error(`PNG chunk [${chunkType}] 长度超过文件边界`);
    const chunkData = bytes.subarray(offset, offset + chunkLen);
    offset += chunkLen;

    const chunkCrc = readUInt32BE(bytes, offset);
    offset += 4;

    // CRC 校验 (针对 chunkType + chunkData)
    const calcCrc = calcCrc32(bytes, offset - 4 - chunkLen - 4, offset - 4);
    if (chunkCrc !== calcCrc) {
      throw new Error(
        `PNG chunk [${chunkType}] CRC 校验失败: 0x${chunkCrc.toString(16)} vs 计算值 0x${calcCrc.toString(16)}`,
      );
    }

    if (!ihdrFound) {
      if (chunkType !== "IHDR")
        throw new Error(`PNG 第一个数据块必须是 IHDR，实际收到: ${chunkType}`);
      if (chunkLen !== 13)
        throw new Error(`IHDR 数据长度非法: ${chunkLen} (必须为 13)`);

      width = readUInt32BE(chunkData, 0);
      height = readUInt32BE(chunkData, 4);
      const bitDepth = chunkData[8];
      colorType = chunkData[9];
      const compressionMethod = chunkData[10];
      const filterMethod = chunkData[11];
      const interlaceMethod = chunkData[12];

      if (width < 1 || height < 1)
        throw new Error(`PNG 图像尺寸必须大于等于 1: ${width}x${height}`);
      if (width > 2048 || height > 2048) {
        throw new Error(
          `PNG 图像单边尺寸超过 2048 像素限制: ${width}x${height}`,
        );
      }
      const totalPixels = width * height;
      if (totalPixels > 4 * 1024 * 1024)
        throw new Error(`PNG 图像总像素数超过 4Mi 限制: ${totalPixels} 像素`);
      if (bitDepth !== 8)
        throw new Error(`仅支持 8-bit PNG，当前 bitDepth=${bitDepth}`);

      if (colorType === 6) {
        bpp = 4; // RGBA
      } else if (colorType === 4) {
        bpp = 2; // Gray + Alpha
      } else {
        throw new Error(
          `仅支持带透明通道的格式 (RGBA 或 Gray+Alpha)，当前 colorType=${colorType}`,
        );
      }

      if (compressionMethod !== 0)
        throw new Error(`不支持的压缩方法: ${compressionMethod}`);
      if (filterMethod !== 0)
        throw new Error(`不支持的滤波器方法: ${filterMethod}`);
      if (interlaceMethod !== 0)
        throw new Error("仅支持非交错 PNG 格式 (不支持 Adam7 交错)");

      ihdrFound = true;
      continue;
    }

    if (chunkType === "IHDR") throw new Error("出现重复的 IHDR chunk");

    if (chunkType === "PLTE") {
      if (
        colorType !== 6 ||
        plteFound ||
        idatBuffers.length ||
        chunkLen === 0 ||
        chunkLen > 768 ||
        chunkLen % 3 !== 0
      )
        throw new Error("PNG PLTE 调色板长度、顺序或颜色类型非法");
      plteFound = true;
      continue;
    }

    if (chunkType === "IDAT") {
      if (iendFound || idatEnded)
        throw new Error("PNG 的 IDAT 图像数据块不连续");
      idatBuffers.push(chunkData);
      totalIdatBytes += chunkLen;
      if (totalIdatBytes > AI_CUTOUT_PNG_MAX_BYTES)
        throw new Error("IDAT 压缩数据总和超出文件限制");
      continue;
    }

    if (idatBuffers.length) idatEnded = true;
    if (chunkType === "IEND") {
      if (chunkLen !== 0) throw new Error("IEND chunk 长度必须为 0");
      iendFound = true;
      break;
    }

    // 判断未知 Critical chunk (首字母大写为 critical)
    const isCritical = (chunkTypeBytes[0] & 0x20) === 0;
    if (isCritical) throw new Error(`不支持的未知关键 chunk: ${chunkType}`);
  }

  if (!ihdrFound) throw new Error("未找到 IHDR 数据块");
  if (!iendFound) throw new Error("未找到 IEND 数据块 (PNG 文件截断)");
  if (offset !== bytes.length)
    throw new Error("PNG 文件包含 IEND 后的异常数据");
  if (idatBuffers.length === 0) throw new Error("未找到任何 IDAT 图像数据块");

  // 合并 IDAT 数据
  let mergedIdat: Uint8Array;
  if (idatBuffers.length === 1) {
    mergedIdat = idatBuffers[0];
  } else {
    mergedIdat = new Uint8Array(totalIdatBytes);
    let idatPos = 0;
    for (const b of idatBuffers) {
      mergedIdat.set(b, idatPos);
      idatPos += b.length;
    }
  }

  // 严格有界解压
  const rowBytes = width * bpp;
  const expectedScanlineBytes = (rowBytes + 1) * height;

  const decompressed = boundedInflate(mergedIdat, expectedScanlineBytes);

  // 逐行滤波重建与透明像素实测计数
  let transparentPixels = 0;
  let fullyTransparentPixels = 0;
  let visiblePixels = 0;
  const totalPixels = width * height;

  const curRow = new Uint8Array(rowBytes);
  const prevRow = new Uint8Array(rowBytes);

  const stride = rowBytes + 1;
  const alphaOffset = bpp - 1; // RGBA 对应 3, Gray+Alpha 对应 1

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[y * stride];
    const srcRowStart = y * stride + 1;

    switch (filterType) {
      case 0: // None
        for (let x = 0; x < rowBytes; x++)
          curRow[x] = decompressed[srcRowStart + x];
        break;
      case 1: // Sub
        for (let x = 0; x < rowBytes; x++) {
          const left = x >= bpp ? curRow[x - bpp] : 0;
          curRow[x] = (decompressed[srcRowStart + x] + left) & 0xff;
        }
        break;
      case 2: // Up
        for (let x = 0; x < rowBytes; x++) {
          const up = y > 0 ? prevRow[x] : 0;
          curRow[x] = (decompressed[srcRowStart + x] + up) & 0xff;
        }
        break;
      case 3: // Average
        for (let x = 0; x < rowBytes; x++) {
          const left = x >= bpp ? curRow[x - bpp] : 0;
          const up = y > 0 ? prevRow[x] : 0;
          curRow[x] =
            (decompressed[srcRowStart + x] + ((left + up) >>> 1)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let x = 0; x < rowBytes; x++) {
          const left = x >= bpp ? curRow[x - bpp] : 0;
          const up = y > 0 ? prevRow[x] : 0;
          const upLeft = y > 0 && x >= bpp ? prevRow[x - bpp] : 0;
          curRow[x] =
            (decompressed[srcRowStart + x] + paethPredictor(left, up, upLeft)) &
            0xff;
        }
        break;
      default:
        throw new Error(`不支持或非法的 PNG 滤波类型: ${filterType}`);
    }

    for (let p = 0; p < width; p++) {
      const alpha = curRow[p * bpp + alphaOffset];
      if (alpha < 255) transparentPixels++;
      if (alpha === 0) fullyTransparentPixels++;
      if (alpha > 0) visiblePixels++;
    }

    prevRow.set(curRow);
  }

  // 严格实测 Alpha 判定
  if (transparentPixels === 0) {
    throw new Error(
      `图像实测无透明像素 (全不透明图像，transparentPixels=0)，非有效抠图`,
    );
  }
  if (fullyTransparentPixels === 0) {
    throw new Error("图像实测无完全透明背景像素 (alpha=0)，非有效抠图");
  }
  if (visiblePixels === 0) {
    throw new Error(
      `图像实测无可见像素 (全透明空白图像，visiblePixels=0)，非有效抠图`,
    );
  }

  return {
    width,
    height,
    transparentPixels,
    visiblePixels,
    totalPixels,
  };
}
