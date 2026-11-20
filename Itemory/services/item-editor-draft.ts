import type { AiVisionItemExtraction } from "./ai-vision";
import {
  isValidYmd,
  minorToDecimalText,
  parseYuanToMinor,
  todayYmd,
} from "./format";

export type ItemEditorDraft = {
  name?: string;
  categoryId?: string;
  categoryHint?: string | null;
  purchasePriceText?: string;
  purchasedOn?: string;
  warrantyUntil?: string | null;
  channel?: string;
  notes?: string;
  sourceNotice?: string;
  dateNeedsConfirmation?: boolean;
  priceNeedsConfirmation?: boolean;
};

/** Defense in depth for callers other than AI; never hydrate an invalid date. */
export function normalizeItemEditorDraft(
  draft: ItemEditorDraft | null | undefined,
): ItemEditorDraft {
  if (!draft) return {};
  const next = { ...draft };
  if (next.purchasedOn && !isValidYmd(next.purchasedOn))
    next.purchasedOn = undefined;
  if (next.warrantyUntil && !isValidYmd(next.warrantyUntil))
    next.warrantyUntil = null;
  if (
    next.warrantyUntil &&
    next.purchasedOn &&
    next.warrantyUntil < next.purchasedOn
  )
    next.warrantyUntil = null;
  if (next.purchasePriceText) {
    try {
      parseYuanToMinor(next.purchasePriceText);
    } catch {
      next.purchasePriceText = "";
    }
  }
  return next;
}

/** Pure mapping. Missing dates stay distinguishable from extracted dates. */
export function aiVisionExtractionToDraft(
  ext: AiVisionItemExtraction,
): ItemEditorDraft {
  const warnings = [...ext.warnings];
  if (!ext.acquiredOn)
    warnings.push(`未识别购入日期，暂填今天（${todayYmd()}），请核对`);
  const source =
    ext.imageType === "order_receipt"
      ? `已提取${ext.channel ?? ""}订单信息，请核对后保存。`
      : "已提取物品信息，请核对后保存。";
  return normalizeItemEditorDraft({
    name: ext.name,
    categoryHint: ext.categoryHint,
    purchasePriceText:
      ext.price === null
        ? ""
        : minorToDecimalText(parseYuanToMinor(String(ext.price))!),
    purchasedOn: ext.acquiredOn ?? undefined,
    dateNeedsConfirmation: !ext.acquiredOn,
    priceNeedsConfirmation: !!ext.priceNeedsConfirmation,
    warrantyUntil: ext.warrantyUntil,
    channel: ext.channel ?? undefined,
    notes: ext.notes ?? undefined,
    sourceNotice:
      source +
      (warnings.length
        ? warnings.join("；").replace(/[。；\s]+$/, "") + "。"
        : ""),
  });
}
