import type { ProviderId } from "../../models";

/** Dashboard display only: preserve the full upstream label everywhere else. */
export function dashboardWindowTitle(provider: ProviderId, label: string): string {
  if (provider === "claude" && label === "模型每周") return "模型 7d";
  let group = label.trim();
  let period = "";
  // Only a standalone title or an explicit trailing period is shortened.
  const match = /(^|\s)(\d+\s*小时|\d+\s*天|每周|每天|每月|\d+h|\d+d)$/.exec(group);
  if (match) {
    const raw = match[2];
    period = raw === "每周" ? "7d" : raw === "每天" ? "1d"
      : raw.replace(/\s*小时$/, "h").replace(/\s*天$/, "d");
    group = group.slice(0, match.index).trim();
  }
  if (provider === "antigravity") {
    const name = group.replace(/\s*\/\s*/g, "/");
    if (name === "Gemini 4 Argon") group = "Argon";
    else if (["Claude/ChatGPT", "Claude/GPT", "Claude and GPT", "Claude and ChatGPT"].includes(name))
      group = "Claude/GPT";
  }
  return [group, period].filter(Boolean).join(" ");
}
