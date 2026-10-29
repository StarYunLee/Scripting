export type WorkbuddyCheckinState =
  | "signed"
  | "unsigned"
  | "failed"
  | "unavailable"
  | "unknown";

export type WorkbuddyCheckinView = {
  state: WorkbuddyCheckinState;
  label: string;
  amountLabel: string | null;
  amount: string | null;
  signed: boolean;
};

// detail 是只读的签到状态文案（见 usage-parser 的 checkinDetail）：
// - “签到状态获取失败”只说明读取失败，不能说成“执行签到失败”；
// - 空/无法识别的内容是未知，不能当成“未签到”。
const FAILED_TEXT = "签到状态获取失败";
const UNKNOWN_TEXT = "签到状态未知";

export function checkinView(
  detail: string | null | undefined,
): WorkbuddyCheckinView {
  const text = (detail || "").trim();

  if (!text) {
    return {
      state: "unknown",
      label: UNKNOWN_TEXT,
      amountLabel: null,
      amount: null,
      signed: false,
    };
  }

  if (/失败/.test(text)) {
    return {
      state: "failed",
      label: FAILED_TEXT,
      amountLabel: null,
      amount: null,
      signed: false,
    };
  }

  if (/未开放/.test(text)) {
    return {
      state: "unavailable",
      label: "签到未开放",
      amountLabel: null,
      amount: null,
      signed: false,
    };
  }

  // 金额只取状态词紧跟的数字，避免把“连续 4 天”里的 4 当成奖励。
  const match = /(已签|可签)\s*\+?([\d][\d,]*(?:\.\d+)?)/.exec(text);
  const amount = match ? `+${match[2]}` : null;
  const streak = /连续\s*(\d+)\s*天/.exec(text);

  if (/已签/.test(text)) {
    return {
      state: "signed",
      label: `今日已签到${streak ? ` · 连续 ${streak[1]} 天` : ""}`,
      amountLabel: amount ? `已领 ${amount}` : null,
      amount,
      signed: true,
    };
  }

  if (/可签/.test(text)) {
    return {
      state: "unsigned",
      label: "今日未签到",
      amountLabel: amount ? `可领 ${amount}` : null,
      amount,
      signed: false,
    };
  }

  return {
    state: "unknown",
    label: UNKNOWN_TEXT,
    amountLabel: null,
    amount: null,
    signed: false,
  };
}
