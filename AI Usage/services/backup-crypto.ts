import type { WidgetChromeStyle } from "../widget/chrome-style";

export type BackupCipherEnvelope = {
  magic: "AI_USAGE_ENCRYPTED_BACKUP";
  schemaVersion: 1;
  createdAt: string;
  kdf: {
    algorithm: "PBKDF2-HMAC-SHA256";
    salt: string; // base64
    iterations: number;
    keyLength: number;
  };
  cipher: {
    algorithm: "AES-256-GCM";
    iv: string; // base64
    ciphertext: string; // base64
  };
};

export type BackupAccountItem = {
  provider: string;
  id: string;
  name: string;
  email: string | null;
  accountId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  secrets: Record<string, string>;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  appVersion: string;
  data: {
    accounts: BackupAccountItem[];
    defaultAccountIds?: Partial<Record<string, string | null>>;
    preferences: {
      displaySettings?: {
        reloadMinutes: number;
        backgroundTheme: string;
        widgetChromeStyle: WidgetChromeStyle;
      };
      appOverview?: {
        hiddenAccountKeys?: string[];
        windowIdsByAccount?: Record<string, string[]>;
      };
      widgetWindows?: {
        selectedWindows?: Record<string, string[]>;
        selectedAccessoryWindows?: Record<string, string[]>;
      };
      dashboardWidget?: {
        hiddenAccountKeys?: string[];
        accountOrder?: string[];
        windowIdsByAccount?: Record<string, string[]>;
        display?: {
          showAccountLabel?: boolean;
        };
      };
    };
  };
};

/**
 * 纯标准 PBKDF2-HMAC-SHA256 密钥派生实现。
 * 针对 256 位（32 字节）密钥，派生单个 32 字节块。
 */
export function deriveKeyPBKDF2(
  password: Data,
  salt: Data,
  iterations: number,
): Data {
  // block 1: salt || INT(1) (big-endian 4 bytes: 0, 0, 0, 1)
  const saltBytes = salt.toIntArray();
  const initialBlock = Data.fromIntArray([...saltBytes, 0, 0, 0, 1]);
  let u = Crypto.hmacSHA256(initialBlock, password);
  const uBytes = u.toIntArray();
  const resultBytes = [...uBytes];

  for (let i = 1; i < iterations; i++) {
    u = Crypto.hmacSHA256(u, password);
    const currBytes = u.toIntArray();
    for (let j = 0; j < resultBytes.length; j++) {
      resultBytes[j] ^= currBytes[j];
    }
  }

  return Data.fromIntArray(resultBytes);
}

/**
 * 使用用户密码与 AES-GCM 加密明文 Payload
 */
export function encryptBackupPayload(
  payload: BackupPayload,
  passphrase: string,
): BackupCipherEnvelope {
  const jsonString = JSON.stringify(payload);
  const rawData = Data.fromRawString(jsonString);
  if (!rawData) throw new Error("无法序列化备份数据");

  // 生成 16 字节随机 Salt
  const salt = Crypto.generateSymmetricKey(128);
  // 生成 12 字节随机 IV (96-bit for GCM)
  const iv = Crypto.generateSymmetricKey(96);

  const passData = Data.fromRawString(passphrase);
  if (!passData) throw new Error("密码格式无效");

  const iterations = 10000;
  const key = deriveKeyPBKDF2(passData, salt, iterations);

  const encrypted = Crypto.encryptAESGCM(rawData, key, { iv });
  if (!encrypted) {
    throw new Error("加密过程失败");
  }

  return {
    magic: "AI_USAGE_ENCRYPTED_BACKUP",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    kdf: {
      algorithm: "PBKDF2-HMAC-SHA256",
      salt: salt.toBase64String(),
      iterations,
      keyLength: 32,
    },
    cipher: {
      algorithm: "AES-256-GCM",
      iv: iv.toBase64String(),
      ciphertext: encrypted.toBase64String(),
    },
  };
}

/**
 * 解密备份信封，校验密码与数据完整性
 */
export function decryptBackupPayload(
  envelope: BackupCipherEnvelope,
  passphrase: string,
): BackupPayload | null {
  if (envelope.magic !== "AI_USAGE_ENCRYPTED_BACKUP") {
    throw new Error("不是有效的 AI Usage 备份文件");
  }
  if (envelope.schemaVersion !== 1) {
    throw new Error("不支持的备份文件版本");
  }

  const salt = Data.fromBase64String(envelope.kdf.salt);
  const iv = Data.fromBase64String(envelope.cipher.iv);
  const ciphertext = Data.fromBase64String(envelope.cipher.ciphertext);
  const passData = Data.fromRawString(passphrase);

  if (!salt || !iv || !ciphertext || !passData) {
    throw new Error("备份文件损坏或密码格式错误");
  }

  const key = deriveKeyPBKDF2(passData, salt, envelope.kdf.iterations);

  // Scripting AES-GCM 解密如果密码错或被篡改，原生层会返回 null
  const decrypted = Crypto.decryptAESGCM(ciphertext, key);
  if (!decrypted) return null;

  const rawJson = decrypted.toRawString();
  if (!rawJson) return null;

  try {
    const payload = JSON.parse(rawJson) as BackupPayload;
    if (payload.version !== 1 || !payload.data) return null;
    return payload;
  } catch {
    return null;
  }
}
