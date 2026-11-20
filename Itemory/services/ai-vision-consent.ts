import { resolveOpenAICompatibleRoot } from "./ai-vision";
const KEY = "itemory.aiVision.uploadConsent.v1";
/** Consent is scoped to canonical root. Storage holds roots only, never keys/images. */
export async function ensureAiVisionUploadConsent(
  root: string,
  current: () => boolean,
): Promise<boolean> {
  const normalized = resolveOpenAICompatibleRoot(root);
  const stored: unknown = Storage.get(KEY);
  const accepted = Array.isArray(stored)
    ? stored.filter((v): v is string => typeof v === "string")
    : [];
  if (!current()) return false;
  if (accepted.includes(normalized)) return true;
  const confirmed = await Dialog.confirm({
    title: "订单截图将发送至所配置的 AI 服务",
    message: `目的地：${normalized.replace(/^https:\/\//, "").split("/")[0]}\n订单截图会上传至此服务并可能产生费用。建议先遮挡姓名、电话、地址及订单编号。原订单截图不会自动成为封面。`,
    confirmLabel: "同意并继续",
    cancelLabel: "取消",
  });
  if (!confirmed || !current()) return false;
  if (
    !Storage.set(KEY, [
      ...accepted.filter((v) => v !== normalized).slice(-19),
      normalized,
    ])
  )
    throw new Error("无法保存上传同意状态，请重试");
  return true;
}
