import {
  resolveWindowTitle,
  type WindowTitle,
  type WindowTitleMode,
} from "../window-title-contract";

export type AntigravityWindowKey =
  | "gemini_five_hour"
  | "gemini_weekly"
  | "third_party_five_hour"
  | "third_party_weekly";

const TITLES: Record<AntigravityWindowKey, WindowTitle> = {
  gemini_five_hour: {
    standard: "Gemini 5 小时",
    compact: "Gemini 5h",
  },
  gemini_weekly: {
    standard: "Gemini 每周",
    compact: "Gemini 7d",
  },
  third_party_five_hour: {
    standard: "Claude/GPT 5 小时",
    compact: "Claude/GPT 5h",
  },
  third_party_weekly: {
    standard: "Claude/GPT 每周",
    compact: "Claude/GPT 7d",
  },
};

export function antigravityWindowTitle(
  key: AntigravityWindowKey,
  mode: WindowTitleMode = "standard",
): string {
  return resolveWindowTitle(TITLES[key], mode);
}
