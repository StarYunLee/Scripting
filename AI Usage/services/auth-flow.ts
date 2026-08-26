import type { ProviderId } from "../models";
import {
  beginProviderAuth,
  completeProviderAuth,
} from "./hub";
import { openAuthorizationPage } from "./browser";
import { openAuthAndCaptureLocalCallback } from "./local-oauth";

export type AuthLaunchResult = {
  profileId: string;
  mode: "present" | "openURL";
  /** 已自动完成 token 交换，无需粘贴。 */
  autoCompleted: boolean;
  /** 需要打开粘贴/确认 sheet。 */
  needsSheet: boolean;
  status: string;
};

const CODEX_CALLBACK_PORT = 1455;
const CODEX_CALLBACK_PATH = "/auth/callback";

function pasteStatus(
  provider: ProviderId,
  mode: "present" | "openURL",
): string {
  if (provider === "cursor" || provider === "kimi" || provider === "copilot") {
    if (mode === "present")
      return "关闭授权页后，返回应用并点击提交（无需粘贴）";
    if (provider === "kimi")
      return "已在系统 Safari 打开 Kimi Code 授权页，完成后返回并点击提交";
    if (provider === "copilot")
      return "已在系统 Safari 打开 GitHub 设备授权页，输入设备码后返回并点击提交";
    return "已在系统 Safari 打开 Cursor 登录页，完成后返回并点击提交";
  }
  if (provider === "zai") {
    if (mode === "present")
      return "关闭控制台后，把 API Key 粘贴到下方并提交";
    return "已打开 API Key 控制台，复制 Key 后粘贴到下方并提交";
  }
  if (provider === "minimax") {
    if (mode === "present")
      return "关闭控制台后，把 Subscription Key 粘贴到下方并提交";
    return "已打开 MiniMax 控制台，复制 Subscription Key 后粘贴到下方并提交";
  }
  if (provider === "codex" && mode === "present") {
    return "未能自动捕获回调时，请粘贴地址栏中的 localhost:1455/auth/callback?...";
  }
  if (mode === "present")
    return "关闭授权页后，把回调地址或授权码粘贴到下方";
  return "已在系统 Safari 打开授权页，完成后把回调地址或授权码粘贴到下方";
}

/**
 * 启动平台授权：Codex 在 in-app Safari 下优先本机捕获回调并自动换 token。
 */
export async function launchProviderAuthorization(
  provider: ProviderId,
  profileId?: string,
): Promise<AuthLaunchResult> {
  const started = await beginProviderAuth(provider, profileId);

  if (provider === "codex") {
    const captured = await openAuthAndCaptureLocalCallback({
      authorizationUrl: started.url,
      port: CODEX_CALLBACK_PORT,
      path: CODEX_CALLBACK_PATH,
    });
    if (captured.callbackUrl) {
      await completeProviderAuth("codex", captured.callbackUrl);
      return {
        profileId: started.profileId,
        mode: captured.mode,
        autoCompleted: true,
        needsSheet: false,
        status: "授权已自动完成",
      };
    }
    return {
      profileId: started.profileId,
      mode: captured.mode,
      autoCompleted: false,
      needsSheet: true,
      status: pasteStatus("codex", captured.mode),
    };
  }

  const mode = await openAuthorizationPage(started.url);
  return {
    profileId: started.profileId,
    mode,
    autoCompleted: false,
    needsSheet: true,
    status: pasteStatus(provider, mode),
  };
}
