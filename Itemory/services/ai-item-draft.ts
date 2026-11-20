import type { AiItemWorkflowResult } from "./ai-item-workflow";
import type { ItemEditorDraft } from "./item-editor-draft";

const DRAFT_KEYS: readonly (keyof ItemEditorDraft)[] = [
  "name",
  "categoryId",
  "categoryHint",
  "purchasePriceText",
  "purchasedOn",
  "warrantyUntil",
  "channel",
  "notes",
  "sourceNotice",
  "dateNeedsConfirmation",
  "priceNeedsConfirmation",
];

/** Keep images in memory and separate from the serializable editor draft. */
export function aiItemCoverImage(result: AiItemWorkflowResult): UIImage | null {
  if (result.mode === "information") return null;
  return result.cutout?.cutout?.image ?? null;
}

/** Pure result mapping: no extraction, transport payloads, errors or image fallback. */
export function makeAiItemEditorDraft(
  result: AiItemWorkflowResult,
): ItemEditorDraft {
  const informationDraft = result.information?.editorDraft ?? null;
  const image = aiItemCoverImage(result);
  if (!informationDraft && !image) return {};

  const draft: ItemEditorDraft = {};
  if (!informationDraft && image) draft.dateNeedsConfirmation = true;
  if (informationDraft) {
    // An explicit allowlist also protects against callers passing excess fields.
    for (const key of DRAFT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(informationDraft, key)) {
        (draft as Record<string, unknown>)[key] = informationDraft[key];
      }
    }
  }

  // Provenance and field warnings only; the editor owns live image status.
  if (!informationDraft && image)
    draft.sourceNotice = "请手动填写物品信息，核对后保存。";
  return draft;
}
