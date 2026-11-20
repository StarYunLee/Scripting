const SENSITIVE =
  /(?:订单(?:编号|号)|收件人|联系人|联系电话|手机(?:号码|号)?|收货地址|配送地址|身份证|运单号|快递单号|姓名)\s*[:：=]?|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<!\d)1[3-9]\d{9}(?!\d)/i;
/** Conservative: drop a sensitive line, never claim comprehensive PII detection. */
export function filterAiVisionNotes(notes: string | null): {
  notes: string | null;
  removed: boolean;
} {
  if (!notes) return { notes: null, removed: false };
  let removed = false;
  const kept = notes
    .split(/[\n；;]/)
    .filter((line) => {
      if (SENSITIVE.test(line)) {
        removed = true;
        return false;
      }
      return true;
    })
    .join("；")
    .trim();
  return { notes: kept || null, removed };
}
