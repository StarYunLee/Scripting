import type { ProviderId } from "../models";
import { providerMeta } from "../models";

/** 额度周期：应用内中文 + 小组件英文缩写 */
export const PERIOD = {
  FIVE_HOUR: { app: "5 小时", widget: "5h" },
  WEEKLY: { app: "每周", widget: "Weekly" },
  MONTHLY: { app: "每月", widget: "Monthly" },
  DAILY: { app: "每天", widget: "Daily" },
  AUTO: { app: "Auto", widget: "Auto" },
  TOTAL: { app: "总计", widget: "Total" },
  API: { app: "第三方 API", widget: "API" },
  GROK_BOT: { app: "Grok Bot", widget: "Grok Bot" },
  QUOTA: { app: "额度", widget: "Quota" },
};

/** 小组件平台短名（与 PlanBadge 平台缩写对齐） */
export function widgetProviderShortName(provider: ProviderId): string {
  if (provider === "codex") return "ChatGPT";
  if (provider === "antigravity") return "Agy";
  return providerMeta(provider).title;
}

/** Claude 模型专属周额度应用内标签 */
export function claudeScopedAppLabel(displayName: string): string {
  const normalized = displayName.trim();
  return normalized ? `${normalized} 每周` : "模型每周";
}

/** 将 API / 历史标签规范为应用内展示文案 */
export function normalizeAppWindowLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;

  const exact: { [key: string]: string } = {
    "所有": PERIOD.TOTAL.app,
    "第三方模型": PERIOD.API.app,
    "周限": PERIOD.WEEKLY.app,
    "模型周限": "模型每周",
  };
  if (exact[trimmed]) return exact[trimmed];

  if (trimmed.endsWith("周限")) {
    return `${trimmed.slice(0, -2)}每周`;
  }

  return trimmed;
}

/** 小组件额度类型缩写（各尺寸统一） */
export function widgetWindowLabel(label: string): string {
  const app = normalizeAppWindowLabel(label);
  const value = app.toLowerCase();

  if (/gemini model|claude and gpt/.test(value)) {
    if (value.includes("5") && (value.includes("时") || value.includes("hour"))) {
      return PERIOD.FIVE_HOUR.widget;
    }
    if (value.includes("周") || value.includes("week")) {
      return PERIOD.WEEKLY.widget;
    }
  }

  if (value.includes("周") || value.includes("week")) return PERIOD.WEEKLY.widget;
  if (value.includes("5") && (value.includes("时") || value.includes("hour"))) {
    return PERIOD.FIVE_HOUR.widget;
  }
  if (value.includes("session")) return PERIOD.FIVE_HOUR.widget;
  if (value.includes("auto")) return PERIOD.AUTO.widget;
  if (value.includes("月") || value.includes("month")) return PERIOD.MONTHLY.widget;
  if (value.includes("天") || value.includes("day")) return PERIOD.DAILY.widget;
  if (value.includes("api") || value.includes("第三方")) return PERIOD.API.widget;
  if (value.includes("grok") && value.includes("bot")) return PERIOD.GROK_BOT.widget;
  if (value.includes("total") || value.includes("总计")) return PERIOD.TOTAL.widget;

  if (label.length <= 10) return label;
  return `${label.slice(0, 9)}…`;
}

export function parseWidgetWindowParts(label: string): {
  group: string | null;
  periodWidget: string;
} {
  const normalized = normalizeAppWindowLabel(label);
  const lower = normalized.toLowerCase();

  if (/gemini model/.test(lower)) {
    return { group: "Gemini", periodWidget: widgetWindowLabel(normalized) };
  }
  if (/claude and gpt/.test(lower)) {
    return { group: "GPT", periodWidget: widgetWindowLabel(normalized) };
  }

  return { group: null, periodWidget: widgetWindowLabel(normalized) };
}

/** 小组件单行标题：平台 · [子类型 ·] 额度缩写 */
export function widgetQuotaTitle(provider: ProviderId, windowLabel: string): string {
  const platform = widgetProviderShortName(provider);
  const parts = parseWidgetWindowParts(windowLabel);
  if (parts.group) {
    return `${platform} · ${parts.group} · ${parts.periodWidget}`;
  }
  return `${platform} · ${parts.periodWidget}`;
}

/** Claude 单账号小组件专用文案 */
export const CLAUDE_WIDGET = {
  fiveHourQuota: "5 小时额度",
  weeklyQuota: "每周额度",
  fableWeekly: "Fable 每周",
  dualFiveHourWeekly: "5 小时 + 每周",
  dualWeeklyFable: "每周 + Fable 每周",
  shortFiveHour: "5H",
  shortWeekly: "每周",
  shortFableWeekly: "Fable 每周",
};

/** 总用量小组件固定文案 */
export const WIDGET_TITLE = "总用量";

export function widgetOverflowSmall(hidden: number): string {
  return `还有 ${hidden} 条`;
}

export function widgetOverflowMedium(hidden: number): string {
  return `还有 ${hidden} 条 · 用大尺寸查看`;
}

export function widgetOverflowLarge(hidden: number): string {
  return `还有 ${hidden} 条未显示`;
}

export function widgetEntryCount(count: number): string {
  return `${count} 条目`;
}

export function widgetRemainingLabel(percent: string): string {
  return `剩余 ${percent}`;
}

export const WIDGET_EMPTY_NO_ACCOUNTS =
  "请先在应用中连接账号，或在设置 → 小组件总览中选择展示内容。";

export const WIDGET_EMPTY_NO_ROWS =
  "所选账号暂无可见额度条目，请在设置 → 小组件总览调整展示内容。";

export const WIDGET_SIZE_DESCRIPTION =
  "小尺寸列表（Small）/ 中尺寸圆环（Medium）/ 大尺寸进度条（Large）";

export const WIDGET_DASHBOARD_SETTINGS_FOOTER =
  `添加 AI Usage 小组件后，将参数粘贴为 dashboard，即可显示多账号总用量。${WIDGET_SIZE_DESCRIPTION}。`;

export const DASHBOARD_PREFS_WIDGET_PRIVACY_FOOTER =
  `默认隐藏邮箱与账号 ID，避免主屏幕泄露隐私。${WIDGET_SIZE_DESCRIPTION}。`;

export const APP_DASHBOARD_SETTINGS_FOOTER =
  "选择用量页要展示的账号与额度条目（5 小时 / 每周等）。";

/** Cursor 额度窗口应用内标签 */
export const CURSOR_WINDOW = {
  AUTO: PERIOD.AUTO.app,
  TOTAL: PERIOD.TOTAL.app,
  API: PERIOD.API.app,
  GROK_BOT: PERIOD.GROK_BOT.app,
  PLAN: "套餐额度",
  ON_DEMAND: "按需额度",
  REQUEST: "请求额度",
};

/** Grok 额度窗口应用内标签 */
export const GROK_WINDOW = {
  WEEKLY: PERIOD.WEEKLY.app,
  BUILD: "Grok Build",
};

/** Antigravity 模型分组名 */
export const ANTIGRAVITY_GROUP = {
  GEMINI_MODEL: "Gemini Model",
  CLAUDE_AND_GPT: "Claude and GPT",
};

/** 按窗口秒数返回标准周期中文标签 */
export function periodLabelForSeconds(
  seconds: number | null,
  fallback?: string,
): string {
  const fb = fallback || PERIOD.QUOTA.app;
  if (seconds === 5 * 3600) return PERIOD.FIVE_HOUR.app;
  if (seconds === 7 * 86400) return PERIOD.WEEKLY.app;
  if (seconds === 30 * 86400) return PERIOD.MONTHLY.app;
  if (seconds === 86400) return PERIOD.DAILY.app;
  return fb;
}

/** Codex 额度窗口标签 */
export function codexWindowLabel(
  name: string,
  seconds: number | null,
): string {
  if (name === "five_hour") return PERIOD.FIVE_HOUR.app;
  if (name === "weekly") return PERIOD.WEEKLY.app;
  if (name === "monthly") return PERIOD.MONTHLY.app;
  if (seconds && seconds >= 86400) return `${Math.round(seconds / 86400)} 天`;
  return "限额";
}

/** GitHub Copilot 额度窗口应用内标签 */
export const COPILOT_WINDOW = {
  CREDITS: "AI Credits",
  CHAT: "Chat",
  COMPLETIONS: "Completions",
};

/** Z.ai / 智谱额度窗口应用内标签 */
export const ZAI_WINDOW = {
  FIVE_HOUR: PERIOD.FIVE_HOUR.app,
  WEEKLY: PERIOD.WEEKLY.app,
  MONTHLY: PERIOD.MONTHLY.app,
  WEB_SEARCH: "Web Search",
};

/** Kimi 5 小时窗口标签（支持动态时长） */
export function kimiFiveHourLabel(seconds: number | null): string {
  if (seconds == null) return PERIOD.FIVE_HOUR.app;
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 5 ? PERIOD.FIVE_HOUR.app : `${hours} 小时`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return PERIOD.FIVE_HOUR.app;
}

function antigravityGroupName(groupName: string, bucketId: string): string {
  const bucket = bucketId.toLowerCase();
  if (bucket.startsWith("gemini-")) return ANTIGRAVITY_GROUP.GEMINI_MODEL;
  if (bucket.startsWith("3p-")) return ANTIGRAVITY_GROUP.CLAUDE_AND_GPT;
  return groupName;
}

/** Antigravity 复合额度窗口标签 */
export function antigravityWindowLabel(
  groupName: string,
  bucketId: string,
  seconds: number | null,
): string {
  const local = periodLabelForSeconds(seconds, bucketId);
  const group = antigravityGroupName(groupName, bucketId);
  return group ? `${group} ${local}` : local;
}
