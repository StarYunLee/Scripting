import {
  resolveWindowTitle,
  type WindowTitle,
  type WindowTitleMode,
} from "../window-title-contract";
import type { LimitWindowName } from "./types";

const TITLES: Record<LimitWindowName, WindowTitle> = {
  five_hour: { standard: "5 小时" },
  weekly: { standard: "每周" },
  weekly_fable: { standard: "Fable 每周", compact: "Fable 7d" },
  weekly_scoped: { standard: "模型每周", compact: "模型 7d" },
};

export function claudeWindowTitle(
  name: LimitWindowName,
  mode: WindowTitleMode = "standard",
): string {
  return resolveWindowTitle(TITLES[name], mode);
}

export function claudeScopedWindowTitle(
  modelName: string,
  mode: WindowTitleMode = "standard",
): string {
  const name = modelName.trim() || "模型";
  return resolveWindowTitle(
    { standard: `${name} 每周`, compact: `${name} 7d` },
    mode,
  );
}
