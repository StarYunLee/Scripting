// Validate ZIP metadata BEFORE calling the native extractor. No ZIP64/encryption/symlinks.
export const ZIP_LIMIT = 128 * 1024 * 1024;
export interface ZipMember {
  name: string;
  size: number;
  crc: number;
}
export function inspectExchangeZip(
  bytes: Uint8Array,
): ZipMember[] {
  if (bytes.length > ZIP_LIMIT || bytes.length < 22)
    throw new Error("ZIP 无效或超过 128 MiB");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number) => v.getUint16(p, true),
    u32 = (p: number) => v.getUint32(p, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50)
    end--;
  if (
    end < Math.max(0, bytes.length - 65557) ||
    end + 22 + u16(end + 20) !== bytes.length
  )
    throw new Error("ZIP 目录尾损坏");
  const count = u16(end + 10),
    start = u32(end + 16),
    size = u32(end + 12);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    count !== u16(end + 8) ||
    count > 10000 ||
    start + size !== end
  )
    throw new Error("不支持分卷、ZIP64 或异常目录");
  let p = start,
    total = 0;
  const names = new Set<string>(),
    offsets: Array<[number, number]> = [],
    result: ZipMember[] = [];
  function extra(pos: number, length: number) {
    const stop = pos + length;
    while (pos < stop) {
      if (pos + 4 > stop) throw new Error("ZIP 扩展字段损坏");
      const id = u16(pos),
        n = u16(pos + 2);
      // Unicode-path fields can change the extraction name after validation.
      if (id === 1 || id === 0x7075)
        throw new Error(
          "不支持 ZIP64 或 Unicode 路径扩展；请使用模板中的 ASCII 文件名重新打包",
        );
      pos += 4 + n;
      if (pos > stop) throw new Error("ZIP 扩展字段越界");
    }
  }
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(p) !== 0x02014b50)
      throw new Error("ZIP 中央目录损坏");
    const flags = u16(p + 8),
      method = u16(p + 10),
      packed = u32(p + 20),
      unpacked = u32(p + 24);
    const nl = u16(p + 28),
      el = u16(p + 30),
      cl = u16(p + 32),
      local = u32(p + 42);
    if (p + 46 + nl + el + cl > end) throw new Error("ZIP 文件名越界");
    const nameBytes = bytes.subarray(p + 46, p + 46 + nl);
    if ([...nameBytes].some((x) => x < 32 || x > 126))
      throw new Error("包内文件名请使用 ASCII 字母、数字与连字符");
    const name = String.fromCharCode(...nameBytes);
    const allowed = /^(data\.json|images\/|images\/[A-Za-z0-9_-]{1,128}\.(png|jpg|jpeg)|README\.md|AI-Prompt\.md|schema\.json|example\.json)$/;
    if (!allowed.test(name)) throw new Error(`ZIP 中不允许的路径：${name}`);
    if (names.has(name.toLowerCase())) throw new Error(`ZIP 重复路径：${name}`);
    names.add(name.toLowerCase());
    const mode = (u32(p + 38) >>> 16) & 0xf000;
    if (
      (mode && mode !== 0x8000 && mode !== 0x4000) ||
      flags & ~0x808 ||
      ![0, 8].includes(method) ||
      u16(p + 34)
    )
      throw new Error(`不支持的 ZIP 文件类型：${name}`);
    if (
      unpacked > (name.endsWith(".json") ? 8 : 32) * 1024 * 1024 ||
      (total += unpacked) > 256 * 1024 * 1024 ||
      (packed === 0 && unpacked > 0) ||
      unpacked / Math.max(1, packed) > 1000
    )
      throw new Error("ZIP 解压体积超过安全限制");
    if (name.endsWith("/") && unpacked !== 0)
      throw new Error("ZIP 目录包含数据");
    if (
      local + 30 > start ||
      u32(local) !== 0x04034b50 ||
      flags !== u16(local + 6) ||
      method !== u16(local + 8)
    )
      throw new Error("ZIP 本地头不一致");
    const ln = u16(local + 26),
      le = u16(local + 28),
      dataStart = local + 30 + ln + le;
    if (ln !== nl || dataStart + packed > start)
      throw new Error("ZIP 本地文件范围错误");
    for (let j = 0; j < nl; j++)
      if (bytes[local + 30 + j] !== nameBytes[j])
        throw new Error("ZIP 本地路径不一致");
    extra(p + 46 + nl, el);
    extra(local + 30 + ln, le);
    if (
      !(flags & 8) &&
      (u32(local + 14) !== u32(p + 16) ||
        u32(local + 18) !== packed ||
        u32(local + 22) !== unpacked)
    )
      throw new Error("ZIP 本地大小或校验不一致");
    let stop = dataStart + packed;
    if (flags & 8) {
      if (stop + 12 > start) throw new Error("ZIP 描述符缺失");
      if (u32(stop) === 0x08074b50) stop += 4;
      if (
        stop + 12 > start ||
        u32(stop) !== u32(p + 16) ||
        u32(stop + 4) !== packed ||
        u32(stop + 8) !== unpacked
      )
        throw new Error("ZIP 描述符不一致");
      stop += 12;
    }
    offsets.push([local, stop]);
    result.push({ name, size: unpacked, crc: u32(p + 16) });
    p += 46 + nl + el + cl;
  }
  if (p !== end || !names.has("data.json"))
    throw new Error("ZIP 根目录缺少核心数据文件或目录长度错误");
  offsets.sort((a, b) => a[0] - b[0]);
  let last = 0;
  for (const [a, b] of offsets) {
    if (a !== last) throw new Error("ZIP 存在重叠或隐藏文件数据");
    last = b;
  }
  if (last !== start) throw new Error("ZIP 含未声明数据");
  return result;
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let k = 0; k < 8; k++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let n = 0; n < bytes.length; n++)
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[n]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
