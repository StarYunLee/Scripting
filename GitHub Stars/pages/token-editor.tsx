import {
  Button,
  HStack,
  Image,
  SecureField,
  Text,
  VStack,
  useState,
} from "scripting";
import type { GitHubError } from "../types";
import {
  validateToken,
  type TokenValidationResult,
} from "../services/github-rest";
import { errorMessage } from "../services/errors";
import { GlassActionRow, GlassDivider } from "../ui/glass";

export type TokenEditorMode = "connect" | "replace";

function tokenErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  ) {
    const githubError = error as GitHubError;
    switch (githubError.kind) {
      case "unauthorized":
        return "Token 无效或已过期，请检查后重试。";
      case "forbidden":
        if (githubError.message.includes("请使用 Personal")) {
          return "请使用 Classic PAT，并授予 user 与 public_repo 权限。";
        }
        if (githubError.message.includes("user")) {
          return "Token 缺少 user 权限。";
        }
        if (githubError.message.includes("public_repo")) {
          return "Token 缺少 public_repo 权限。";
        }
        if (githubError.message.includes("repo")) {
          return "显示私有仓库需要 repo 权限。";
        }
        return "Token 权限不足，请检查 Classic PAT 权限后重试。";
      case "network":
        return "无法连接 GitHub，请检查网络后重试。";
      case "rate_limited":
        return "GitHub API 已限流，请稍后重试。";
      case "invalid_response":
        return "GitHub 返回了无法识别的数据，请稍后重试。";
      default:
        break;
    }
  }
  const message = errorMessage(error);
  if (message.includes("Keychain")) {
    return "无法保存访问凭据，请稍后重试。";
  }
  return "无法验证 Token，请检查后重试。";
}

export function TokenEditor(props: {
  mode: TokenEditorMode;
  includePrivateRepositories: boolean;
  onVerified: (
    token: string,
    result: TokenValidationResult,
  ) => void | Promise<void>;
  onBusyChanged?: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionTitle = props.mode === "connect" ? "验证并保存" : "验证并替换";

  async function pasteToken() {
    if (busy) return;
    setError(null);
    try {
      const value = await Pasteboard.getString();
      if (!value?.trim()) {
        setError("剪贴板中没有可用的文本 Token。");
        return;
      }
      setDraft(value.trim());
    } catch {
      setError("无法读取剪贴板，请检查 Scripting 的粘贴权限。");
    }
  }

  async function submit() {
    const token = draft.trim();
    if (!token || busy) return;
    if (token.length < 20 || /\s/.test(token)) {
      setError("Token 格式不正确，请检查后重试。");
      return;
    }
    setBusy(true);
    props.onBusyChanged?.(true);
    setError(null);
    try {
      const result = await validateToken(
        token,
        props.includePrivateRepositories,
      );
      await props.onVerified(token, result);
    } catch (value) {
      setError(tokenErrorMessage(value));
    } finally {
      setBusy(false);
      props.onBusyChanged?.(false);
    }
  }

  return (
    <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
      <HStack
        spacing={8}
        alignment="center"
        padding={{ vertical: 12 }}
        frame={{ maxWidth: "infinity" }}
      >
        <SecureField
          title="Token"
          prompt="ghp_…"
          value={draft}
          onChanged={(value: string) => {
            setDraft(value);
            if (error) setError(null);
          }}
          disabled={busy}
          frame={{ maxWidth: "infinity" }}
        />
        <Button
          title="粘贴"
          buttonStyle="plain"
          foregroundStyle={busy ? "secondaryLabel" : "accentColor"}
          disabled={busy}
          action={() => {
            void pasteToken();
          }}
        />
      </HStack>
      {error ? (
        <HStack
          spacing={6}
          padding={{ top: 8, bottom: 4 }}
          frame={{ maxWidth: "infinity" }}
          alignment="top"
        >
          <Image
            systemName="exclamationmark.triangle.fill"
            foregroundStyle="systemRed"
          />
          <Text
            foregroundStyle="systemRed"
            fixedSize={{ horizontal: false, vertical: true }}
          >
            {error}
          </Text>
        </HStack>
      ) : null}
      <GlassDivider />
      <GlassActionRow
        title={busy ? "正在验证…" : actionTitle}
        centered
        natural
        disabled={!draft.trim() || busy}
        action={() => {
          void submit();
        }}
      />
    </VStack>
  );
}
