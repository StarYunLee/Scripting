import type { UploadDraft } from "./models";

export type DraftPickMode = "stay" | "back";

/**
 * 外部来源加入上传列表后的统一确认：
 * 返回上传列表 / 继续选择。
 */
export async function confirmAddedDraft(
  draft: UploadDraft,
): Promise<DraftPickMode> {
  return confirmAddedDrafts([draft]);
}

export async function confirmAddedDrafts(
  drafts: UploadDraft[],
): Promise<DraftPickMode> {
  const action = await Dialog.actionSheet({
    title: "已加入上传列表",
    message:
      drafts.length === 1
        ? drafts[0].filename
        : `已加入 ${drafts.length} 个图标`,
    actions: [{ label: "返回上传列表" }, { label: "继续选择" }],
  });
  return action === 0 ? "back" : "stay";
}
