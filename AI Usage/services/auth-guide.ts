import type { AuthSheet, ProviderId } from "../models";

export type AuthGuideKind = "callback" | "check" | "device" | "key";
export type AuthGuideState = "ready" | "checking" | "deferred" | "rejected" | "failed" | "cancelFailed";
export type AuthGuideCopy = {
  kind: AuthGuideKind;
  openTitle: string;
  openDetail: string;
  openLabel: string;
  resultTitle: string;
  resultDetail?: string;
  inputTitle: string;
  example?: string;
};

const CALLBACK_COPY: Partial<Record<ProviderId, [string, string, string, string?]>> = {
  codex: ["ChatGPT", "复制回调地址", "授权后可能出现打不开的 localhost 页面，这是正常的。请复制地址栏中的完整地址。", "localhost:1455/auth/callback?code=…&state=…"],
  grok: ["xAI", "复制授权结果", "复制完整回调地址；若页面显示一次性授权码，也可复制该授权码。", "127.0.0.1:56122/callback?code=…"],
  claude: ["Anthropic", "复制授权码", "在授权结果页点击 Copy Code，复制完整授权码。", "code#state"],
  antigravity: ["Google", "复制回调地址", "授权后可能出现打不开的 localhost 页面，这是正常的。请复制地址栏中的完整地址。", "localhost:51121/oauth-callback?code=…&state=…"],
};

const CONSOLE_NAMES: Partial<Record<ProviderId, [string, string]>> = {
  zai: ["智谱开放平台", "Z.ai"],
  minimax: ["minimaxi.com", "minimax.io"],
};

export function authGuideCopy(provider: ProviderId, region: AuthGuideRegion = "cn"): AuthGuideCopy {
  const callback = CALLBACK_COPY[provider];
  if (callback) return {
    kind: "callback", openTitle: "打开授权页",
    openDetail: `在 ${callback[0]} 页面登录并确认授权。`,
    openLabel: `前往 ${callback[0]} 授权`, resultTitle: callback[1],
    resultDetail: callback[2], inputTitle: provider === "claude" ? "授权码" : provider === "grok" ? "回调地址或一次性授权码" : "回调地址",
    example: callback[3],
  };
  if (provider === "copilot") return {
    kind: "device", openTitle: "打开授权页",
    openDetail: "登录并输入设备码后确认授权。", openLabel: "前往 GitHub 授权",
    resultTitle: "授权结果", resultDetail: "完成确认后会自动检查结果。", inputTitle: "",
  };
  if (provider === "zai" || provider === "minimax" || provider === "deepseek") {
    const inputTitle = provider === "minimax" ? "Subscription Key" : "API Key";
    const consoleName = CONSOLE_NAMES[provider]?.[region === "intl" ? 1 : 0];
    return {
      kind: "key", openTitle: `获取 ${inputTitle}`,
      openDetail: consoleName ? `在${consoleName}控制台创建并复制。` : "没有密钥时，前往 DeepSeek 开放平台创建。",
      openLabel: consoleName ? "前往控制台" : "前往开放平台",
      resultTitle: `粘贴 ${inputTitle}`, inputTitle,
    };
  }
  const name = provider === "kimi" ? "Kimi Code" : provider === "workbuddy" ? "WorkBuddy" : "Cursor";
  return {
    kind: "check", openTitle: "打开授权页",
    openDetail: `在 ${name} 页面登录并确认授权。`, openLabel: `前往 ${name} 授权`,
    resultTitle: "授权结果", resultDetail: "打开授权页完成登录后，会自动检查结果。", inputTitle: "",
  };
}

export function authGuideState(sheet: AuthSheet, completing = false): AuthGuideState {
  if (completing) return "checking";
  if (sheet.status.startsWith("授权失败：")) return "failed";
  if (sheet.status.startsWith("取消授权失败：")) return "cancelFailed";
  if (sheet.status.startsWith("授权待继续：")) return "deferred";
  if (sheet.status.startsWith("授权输入有误：")) return "rejected";
  return "ready";
}

export function authGuideDetail(sheet: AuthSheet): string {
  return sheet.status.replace(/^(授权失败|取消授权失败|授权待继续|授权输入有误)：/, "");
}

export type AuthGuideRegion = "intl" | "cn";
export type AuthGuideRegionOption = { value: AuthGuideRegion; label: string; detail: string };

/** Selectable sites for providers whose console differs by region; null means no site step. */
export function authGuideRegions(provider: ProviderId): AuthGuideRegionOption[] | null {
  if (provider === "zai") return [
    { value: "cn", label: "国内站", detail: "智谱开放平台" },
    { value: "intl", label: "国际站", detail: "Z.ai" },
  ];
  if (provider === "minimax") return [
    { value: "cn", label: "国内站", detail: "minimaxi.com" },
    { value: "intl", label: "国际站", detail: "minimax.io" },
  ];
  if (provider === "workbuddy") return [
    { value: "cn", label: "国内站", detail: "workbuddy.cn" },
    { value: "intl", label: "国际站", detail: "workbuddy.ai" },
  ];
  return null;
}

/** A sheet without a recorded region falls back to the domestic site, the default selection. */
export function authGuideSelectedRegion(sheet: AuthSheet): AuthGuideRegion {
  if (!authGuideRegions(sheet.provider)) return "cn";
  return sheet.authorizationRegion === "intl" ? "intl" : "cn";
}

/** Retryable failures must release paste submission, while leaving credential validation to the provider. */
export function mayRetryAuthInput(state: AuthGuideState): boolean {
  return state === "deferred" || state === "rejected" || state === "failed";
}
