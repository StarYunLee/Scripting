import type { ForkSyncState } from "../types";

export function classifyForkSyncState(
  aheadBy: number,
  behindBy: number,
): ForkSyncState {
  if (behindBy === 0) return "current";
  return aheadBy > 0 ? "diverged" : "behind";
}

export function forkStatusColor(state: ForkSyncState): string {
  switch (state) {
    case "current":
      return "systemGreen";
    case "behind":
      return "systemOrange";
    case "diverged":
      return "systemPurple";
    case "error":
      return "systemRed";
    case "checking":
      return "systemBlue";
    default:
      return "systemGray";
  }
}

export function forkStatusLabel(state: ForkSyncState): string {
  switch (state) {
    case "current":
      return "最新";
    case "behind":
      return "待同步";
    case "diverged":
      return "已分叉";
    case "error":
      return "检查失败";
    case "checking":
      return "检查中";
    default:
      return "未检查";
  }
}
