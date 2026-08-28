import {
  resolveWindowTitle,
  type WindowTitle,
  type WindowTitleMode,
} from "../window-title-contract";
import type { LimitWindowName } from "./types";

const TITLES: Record<LimitWindowName, WindowTitle> = {
  five_hour: { standard: "5 小时" },
  weekly: { standard: "每周" },
  weekly_build: { standard: "Grok Build 每周", compact: "Build 7d" },
  monthly: { standard: "每月" },
  unknown: { standard: "限额" },
};

export function grokWindowTitle(
  name: LimitWindowName,
  mode: WindowTitleMode = "standard",
): string {
  return resolveWindowTitle(TITLES[name], mode);
}
