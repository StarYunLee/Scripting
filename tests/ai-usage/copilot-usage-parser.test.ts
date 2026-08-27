import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCopilotPlanLabel,
  parseCopilotUsage,
} from "../../AI Usage/providers/copilot/usage-parser";

const reset = "2026-10-01T00:00:00.000Z";

test("parses premium requests chat and completions from a fixed Copilot payload", () => {
  const parsed = parseCopilotUsage({
    quota_reset_date_utc: "2026-10-01",
    copilot_plan: "individual",
    access_type_sku: "copilot_pro",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 300,
        remaining: 225,
        percent_remaining: 75,
        unlimited: false,
      },
      chat: {
        entitlement: 50,
        remaining: 20,
        percent_remaining: 40,
        unlimited: false,
      },
      completions: {
        entitlement: 2000,
        remaining: 1800,
        percent_remaining: 90,
        unlimited: false,
      },
    },
  });

  assert.deepEqual(parsed, {
    planLabel: "Pro",
    credits: {
      id: "copilot:credits",
      name: "credits",
      label: "AI Credits",
      usedPercent: 25,
      remainingPercent: 75,
      resetAt: reset,
      resetAtMs: Date.parse(reset),
      windowSeconds: 2592000,
    },
    chat: {
      id: "copilot:chat",
      name: "chat",
      label: "Chat",
      usedPercent: 60,
      remainingPercent: 40,
      resetAt: reset,
      resetAtMs: Date.parse(reset),
      windowSeconds: 2592000,
    },
    completions: {
      id: "copilot:completions",
      name: "completions",
      label: "Completions",
      usedPercent: 10,
      remainingPercent: 90,
      resetAt: reset,
      resetAtMs: Date.parse(reset),
      windowSeconds: 2592000,
    },
    windows: [
      {
        id: "copilot:credits",
        name: "credits",
        label: "AI Credits",
        usedPercent: 25,
        remainingPercent: 75,
        resetAt: reset,
        resetAtMs: Date.parse(reset),
        windowSeconds: 2592000,
      },
      {
        id: "copilot:chat",
        name: "chat",
        label: "Chat",
        usedPercent: 60,
        remainingPercent: 40,
        resetAt: reset,
        resetAtMs: Date.parse(reset),
        windowSeconds: 2592000,
      },
      {
        id: "copilot:completions",
        name: "completions",
        label: "Completions",
        usedPercent: 10,
        remainingPercent: 90,
        resetAt: reset,
        resetAtMs: Date.parse(reset),
        windowSeconds: 2592000,
      },
    ],
  });
});

test("uses access_type_sku to distinguish Free from ambiguous individual plan", () => {
  assert.equal(formatCopilotPlanLabel("individual", "copilot_free"), "Free");
  assert.equal(formatCopilotPlanLabel("individual", "copilot_pro_plus"), "Pro+");
  assert.equal(formatCopilotPlanLabel("individual", "copilot_business"), "Business");
  assert.equal(formatCopilotPlanLabel("individual", "copilot_enterprise"), "Enterprise");
  assert.equal(formatCopilotPlanLabel("individual", null), "Individual");
});

test("derives quota percentage from entitlement and remaining when percent is absent", () => {
  const parsed = parseCopilotUsage({
    quota_reset_date: "2026-10-01T00:00:00Z",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 300,
        remaining: 120,
        unlimited: false,
      },
    },
  });
  assert.equal(parsed?.credits?.remainingPercent, 40);
  assert.equal(parsed?.credits?.usedPercent, 60);
});

test("omits unlimited quotas but preserves an exhausted finite quota", () => {
  const parsed = parseCopilotUsage({
    quota_snapshots: {
      chat: {
        entitlement: 0,
        remaining: 0,
        percent_remaining: 100,
        unlimited: true,
      },
      completions: {
        entitlement: 2000,
        remaining: 0,
        percent_remaining: 0,
        unlimited: false,
      },
    },
  });
  assert.equal(parsed?.chat, null);
  assert.equal(parsed?.completions?.remainingPercent, 0);
  assert.equal(parsed?.windows.length, 1);
  assert.equal(parseCopilotUsage({ quota_snapshots: {} }), null);
});
