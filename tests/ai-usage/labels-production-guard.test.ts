import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../../AI Usage/", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("Stage G wires canonical App labels through settings and demo producers", async () => {
  const [labels, claudeSettings, demo] = await Promise.all([
    source("copy/labels.ts"),
    source("providers/claude/WidgetSettingsView.tsx"),
    source("services/demo.ts"),
  ]);

  assert.match(labels, /export const CLAUDE_WIDGET/);
  assert.match(claudeSettings, /copy\/labels/);
  assert.match(claudeSettings, /CLAUDE_WIDGET\.dualFiveHourWeekly/);
  assert.match(claudeSettings, /CLAUDE_WIDGET\.shortFableWeekly/);
  assert.doesNotMatch(claudeSettings, />[^<]*周限[^<]*</);
  assert.doesNotMatch(demo, /label: "(?:Fable )?周限"/);
});
