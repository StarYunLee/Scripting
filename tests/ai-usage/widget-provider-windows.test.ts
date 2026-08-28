import assert from "node:assert/strict";
import { test } from "node:test";
import {
  providerResetLine,
  providerWidgetWindowRows,
  widgetWindowCandidates,
} from "../../AI Usage/widget/shared/provider-windows";
import { selectWidgetWindows } from "../../AI Usage/widget/shared/window-model";

function window(
  id: string,
  overrides?: Partial<{
    id: string;
    label: string;
    usedPercent: number | null;
    remainingPercent: number | null;
    resetAt: string | null;
  }>,
) {
  return {
    id: overrides?.id ?? id,
    label: overrides?.label ?? id,
    usedPercent: overrides?.usedPercent ?? 25,
    remainingPercent: overrides?.remainingPercent ?? 75,
    resetAt: overrides?.resetAt ?? "2026-09-01T00:00:00Z",
  };
}

function snapshot(provider: "codex" | "grok" | "other", windows: ReturnType<typeof window>[]) {
  return {
    windows,
    planLabel: "Pro",
    planType: "pro",
    fetchedAt: "2026-08-27T00:00:00Z",
    ...(provider === "other"
      ? {}
      : { resetCreditsAvailable: 3, resetCreditExpirations: ["2026-09-02T00:00:00Z"] }),
  };
}

test("preserves product qualifiers while compacting only the period", () => {
  const codexRows = providerWidgetWindowRows(
    "codex",
    snapshot("codex", [
      window("weekly", { id: "codex:spark-weekly", label: "Spark 每周" }),
    ]),
  );
  assert.deepEqual(codexRows.map((row) => row.label), ["Spark 7D"]);

  const antigravityRows = providerWidgetWindowRows(
    "antigravity",
    snapshot("other", [
      window("five_hour", {
        id: "antigravity:3p_5h",
        label: "Claude and GPT 5 小时",
      }),
      window("weekly", {
        id: "antigravity:3p_weekly",
        label: "Claude and GPT 每周",
      }),
    ]),
  );
  assert.deepEqual(antigravityRows.map((row) => row.label), [
    "Claude/GPT 5H",
    "Claude/GPT 7D",
  ]);
});

test("maps generic five hour and weekly windows to single-line 5H and 7D titles", () => {
  const rows = providerWidgetWindowRows(
    "kimi",
    snapshot("other", [window("five_hour", { label: "5 小时" }), window("weekly", { label: "每周" })]),
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ["5H", "7D"],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["kimi:five_hour", "kimi:weekly"],
  );
});

test("keeps provider-specific extra windows with distinct ids", () => {
  const rows = providerWidgetWindowRows(
    "codex",
    snapshot("codex", [
      window("five_hour", { label: "5 小时" }),
      window("weekly", { label: "每周" }),
      window("monthly", { label: "每月" }),
    ]),
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.label]),
    [
      ["codex:five_hour", "5H"],
      ["codex:weekly", "7D"],
      ["codex:monthly", "Monthly"],
    ],
  );
});

test("labels Cursor windows with compact titles in source order", () => {
  const rows = providerWidgetWindowRows(
    "cursor",
    snapshot("other", [
      window("auto", { label: "Auto" }),
      window("total", { label: "Total" }),
      window("api", { label: "API" }),
      window("grok_bot", { label: "Grok Bot" }),
      window("weekly", { label: "每周" }),
    ]),
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Auto", "Total", "API", "Grok Bot", "7D"],
  );
});

test("splits Antigravity dual groups by window id", () => {
  const rows = providerWidgetWindowRows(
    "antigravity",
    snapshot("other", [
      window("gemini_5h", { label: "Gemini 5 小时" }),
      window("gemini_weekly", { label: "Gemini 每周" }),
      window("3p_5h", { label: "三方 5 小时" }),
      window("3p_weekly", { label: "三方 每周" }),
    ]),
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Gemini 5H", "Gemini 7D", "Claude/GPT 5H", "Claude/GPT 7D"],
  );
});

test("caps Claude scoped weekly and Copilot quota rows without collisions", () => {
  const claudeRows = providerWidgetWindowRows(
    "claude",
    snapshot("other", [
      window("five_hour", { label: "5 小时" }),
      window("weekly", { label: "每周" }),
      window("weekly_fable", { label: "Fable 每周" }),
    ]),
  );
  assert.deepEqual(
    claudeRows.map((row) => row.label),
    ["5H", "7D", "Fable 7D"],
  );
  const copilotRows = providerWidgetWindowRows(
    "copilot",
    snapshot("other", [window("credits", { label: "额度" }), window("chat", { label: "对话" })]),
  );
  assert.equal(copilotRows[0].id, "copilot:credits");
  assert.deepEqual(selectWidgetWindows(claudeRows, ["claude:weekly_fable"]).map((row) => row.id), [
    "claude:five_hour",
    "claude:weekly",
  ]);
});

test("hiding every window honestly yields an empty widget", () => {
  const rows = providerWidgetWindowRows(
    "zai",
    snapshot("other", [window("five_hour"), window("weekly")]),
  );
  assert.deepEqual(selectWidgetWindows(rows, ["zai:five_hour", "zai:weekly"]), []);
});

test("selecting from more than four windows shows at most four", () => {
  const rows = providerWidgetWindowRows(
    "cursor",
    snapshot("other", [
      window("auto"),
      window("total"),
      window("api"),
      window("grok_bot"),
      window("weekly"),
    ]),
  );
  assert.equal(selectWidgetWindows(rows, []).length, 4);
});

test("keeps reset credits only for Codex and Grok", () => {
  assert.deepEqual(providerResetLine("codex", snapshot("codex", [])), {
    available: 3,
    nearestExpiration: "2026-09-02T00:00:00Z",
  });
  assert.deepEqual(providerResetLine("grok", snapshot("grok", [])), {
    available: 3,
    nearestExpiration: "2026-09-02T00:00:00Z",
  });
  assert.equal(providerResetLine("kimi", snapshot("other", [])), null);
  const noCredits = snapshot("codex", []);
  noCredits.resetCreditsAvailable = null;
  noCredits.resetCreditExpirations = [];
  assert.equal(providerResetLine("codex", noCredits), null);
});

test("reset credits follow each provider snapshot not a global value", () => {
  const empty = {
    windows: [],
    planLabel: null,
    planType: null,
    fetchedAt: "2026-08-27T00:00:00Z",
    resetCreditsAvailable: null,
    resetCreditExpirations: [],
  };
  const line = providerResetLine("grok", empty);
  assert.equal(line, null);
});

test("settings candidates come from the latest cached snapshot only", () => {
  const rows = widgetWindowCandidates(
    "minimax",
    snapshot("other", [window("five_hour", { label: "5 小时" }), window("weekly", { label: "每周" })]),
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.label]),
    [
      ["minimax:five_hour", "5H"],
      ["minimax:weekly", "7D"],
    ],
  );
  assert.deepEqual(widgetWindowCandidates("minimax", null), []);
});
