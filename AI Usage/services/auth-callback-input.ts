import type { ProviderId } from "../models";

export type ClipboardPasteAlert = {
  title: string;
  message: string;
};

function withHttpScheme(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1):/i.test(value)) return `http://${value}`;
  return value;
}

function isUrlLike(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^(localhost|127\.0\.0\.1):/i.test(value)
  );
}

function parseLocalCallback(
  value: string,
  host: "localhost" | "127.0.0.1" | "either",
  port: string,
  pathname: string,
): boolean {
  let url: URL;
  try {
    url = new URL(withHttpScheme(value));
  } catch {
    return false;
  }
  const hostOk =
    host === "either"
      ? url.hostname === "localhost" || url.hostname === "127.0.0.1"
      : url.hostname === host;
  return (
    url.protocol === "http:" &&
    hostOk &&
    url.port === port &&
    url.pathname === pathname &&
    Boolean(url.searchParams.get("code"))
  );
}

const GROK_ONE_TIME_CODE = /^[A-Za-z0-9._~-]{32,2048}$/;
const CLAUDE_ONE_TIME_CODE = /^[A-Za-z0-9._~+/=-]{16,4096}$/;

export function isPasteCallbackProvider(provider: ProviderId): boolean {
  return (
    provider === "codex" ||
    provider === "antigravity" ||
    provider === "grok" ||
    provider === "claude" ||
    provider === "zai" ||
    provider === "minimax"
  );
}

export function looksLikeAuthorizationInput(
  provider: ProviderId,
  input: string,
): boolean {
  const value = input.trim();
  if (!value) return false;
  if (provider === "codex")
    return parseLocalCallback(value, "either", "1455", "/auth/callback");
  if (provider === "antigravity")
    return parseLocalCallback(value, "localhost", "51121", "/oauth-callback");
  if (provider === "grok") {
    if (parseLocalCallback(value, "either", "56122", "/callback")) return true;
    return GROK_ONE_TIME_CODE.test(value) && !value.includes("=");
  }
  if (provider === "claude") {
    if (/^https?:\/\//i.test(value)) {
      try {
        return Boolean(new URL(value).searchParams.get("code"));
      } catch {
        return false;
      }
    }
    const splitAt = value.lastIndexOf("#");
    if (splitAt > 0) {
      return Boolean(
        value.slice(0, splitAt).trim() && value.slice(splitAt + 1).trim(),
      );
    }
    return CLAUDE_ONE_TIME_CODE.test(value);
  }
  if (provider === "zai" || provider === "minimax") {
    const key = value.replace(/^Bearer\s+/i, "").trim();
    return Boolean(key) && !isUrlLike(key);
  }
  return false;
}

export function clipboardPasteError(
  provider: ProviderId,
  raw: string | null | undefined,
): ClipboardPasteAlert | null {
  if (!isPasteCallbackProvider(provider)) return null;
  const value = raw?.trim() ?? "";
  if (!value) {
    if (provider === "claude") {
      return {
        title: "未读取到授权码",
        message: "请先复制完整授权码后再试。",
      };
    }
    if (provider === "zai") {
      return {
        title: "未读取到 API Key",
        message: "请先复制完整密钥后再试。",
      };
    }
    if (provider === "minimax") {
      return {
        title: "未读取到 Subscription Key",
        message: "请先复制完整密钥后再试。",
      };
    }
    return {
      title: "未读取到授权回调地址",
      message: "请先复制完整回调地址后再试。",
    };
  }
  if (looksLikeAuthorizationInput(provider, value)) return null;
  if (provider === "zai") {
    return {
      title: "API Key 无效",
      message: "请重新复制完整密钥后再试。",
    };
  }
  if (provider === "minimax") {
    return {
      title: "Subscription Key 无效",
      message: "请重新复制完整密钥后再试。",
    };
  }
  if (provider === "claude") {
    return {
      title: "授权码无效",
      message: "请重新复制完整授权码（code#state）后再试。",
    };
  }
  if (provider === "grok" && !isUrlLike(value)) {
    return {
      title: "授权码无效",
      message: "请重新复制完整授权码后再试。",
    };
  }
  return {
    title: "授权回调地址无效",
    message: "请重新复制完整回调地址后再试。",
  };
}
