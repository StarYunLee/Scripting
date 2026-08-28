import { isMissingProfilePatError } from "../services/errors";

export async function promptForProfilePat(
  onOpenSettings: () => void,
  message = "当前仓库未配置个人访问令牌。",
): Promise<void> {
  const action = await Dialog.actionSheet({
    title: "无法写入仓库",
    message,
    actions: [{ label: "去设置填令牌" }],
  });
  if (action === 0) {
    onOpenSettings();
  }
}

export async function handleMissingProfilePat(
  error: unknown,
  onOpenSettings: () => void,
): Promise<boolean> {
  if (!isMissingProfilePatError(error)) {
    return false;
  }
  await promptForProfilePat(onOpenSettings, error.message);
  return true;
}
