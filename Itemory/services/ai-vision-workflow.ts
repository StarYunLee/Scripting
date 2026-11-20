import type { AbortSignal } from "scripting";
import {
  extractItemFromImage,
  matchBestCategory,
  type AiVisionProfile,
  type AiVisionExtractResult,
} from "./ai-vision";
import {
  aiVisionExtractionToDraft,
  type ItemEditorDraft,
} from "./item-editor-draft";
import { prepareAiVisionImage } from "./ai-vision-image";

type Candidate = { id: string; name: string; normalizedName: string };
export type AiVisionWorkflowResult = AiVisionExtractResult & {
  editorDraft: ItemEditorDraft | null;
  matchedCategoryName: string | null;
  imagePreparation: {
    width: number;
    height: number;
    resized: boolean;
    quality: number;
  };
};
export function attachAiVisionDraft(
  result: AiVisionExtractResult,
  categories: Candidate[],
) {
  if (!result.contractOk || !result.extraction)
    return { ...result, editorDraft: null, matchedCategoryName: null };
  const draft = aiVisionExtractionToDraft(result.extraction);
  const category = matchBestCategory(draft.categoryHint, categories);
  draft.categoryId = category?.id;
  if (draft.categoryHint && !category)
    draft.sourceNotice = `${(draft.sourceNotice ?? "").replace(/[。；\s]+$/, "")}。分类建议未唯一匹配，请手动选择。`;
  return {
    ...result,
    editorDraft: draft,
    matchedCategoryName: category?.name ?? null,
  };
}
export async function runAiVisionWorkflow(
  input: {
    profile: AiVisionProfile;
    apiKey: string;
    image: UIImage;
    signal?: AbortSignal;
    onPhase?: (phase: "preparing" | "requesting") => void;
    isCurrent: () => boolean;
  },
  consent?: (root: string, current: () => boolean) => Promise<boolean>,
): Promise<AiVisionWorkflowResult> {
  const { ensureAiVisionUploadConsent } = await import("./ai-vision-consent");
  // Internal consent adapter: the shared workflow only grants the root it already confirmed.
  if (input.signal?.aborted || !input.isCurrent())
    throw new Error("操作已取消");
  if (
    !(await (consent ?? ensureAiVisionUploadConsent)(
      input.profile.baseURL,
      input.isCurrent,
    ))
  )
    throw new Error("已取消上传");
  const { listCategories } = await import("./queries");
  const { filterSelectableCategories } = await import("./prefs");
  const categories = filterSelectableCategories(await listCategories());
  if (!input.isCurrent()) throw new Error("操作已取消");
  input.onPhase?.("preparing");
  // Yield once so the native HUD can render before synchronous JPEG work.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!input.isCurrent()) throw new Error("任务已取消");
  const image = prepareAiVisionImage(input.image);
  if (!input.isCurrent()) throw new Error("操作已取消");
  input.onPhase?.("requesting");
  const result = await extractItemFromImage({
    baseURL: input.profile.baseURL,
    apiKey: input.apiKey,
    model: input.profile.model,
    imageBase64OrDataUrl: image.dataUrl,
    endpointKind: input.profile.endpointKind,
    candidateCategories: categories.map((c) => c.name),
    customPrompt: input.profile.customPrompt || undefined,
    reasoningEffort: "low",
    signal: input.signal,
  });
  if (!input.isCurrent()) throw new Error("操作已取消");
  const { dataUrl: _discard, ...imagePreparation } = image;
  return { ...attachAiVisionDraft(result, categories), imagePreparation };
}
