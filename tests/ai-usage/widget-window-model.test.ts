import assert from "node:assert/strict";
import { test } from "node:test";
import {
  remainingPercent,
  selectWidgetWindows,
  widgetMultiLayout,
  widgetPresentation,
} from "../../AI Usage/widget/shared/window-model";

type Window = {
  id: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
};

const row = (id: string): Window => ({
  id,
  label: id,
  usedPercent: 25,
  remainingPercent: 75,
  resetAt: null,
});

test("selects enabled windows in source order and caps the widget at four", () => {
  const rows = [row("one"), row("two"), row("three"), row("four"), row("five")];
  assert.deepEqual(
    selectWidgetWindows(rows, ["two"]).map((item) => item.id),
    ["one", "three", "four", "five"],
  );
  assert.deepEqual(selectWidgetWindows(rows, rows.map((item) => item.id)), []);
});

test("maps visible counts to empty single dual and multi presentations", () => {
  assert.equal(widgetPresentation(0), "empty");
  assert.equal(widgetPresentation(1), "single");
  assert.equal(widgetPresentation(2), "dual");
  assert.equal(widgetPresentation(3), "multi");
  assert.equal(widgetPresentation(4), "multi");
  assert.equal(widgetPresentation(9), "multi");
});

test("provides readable compact geometry only for three and four rows", () => {
  assert.deepEqual(widgetMultiLayout("systemSmall", 3), {
    contentSpacing: 5,
    rowSpacing: 1,
    titleFont: 10,
    valueFont: 10,
    trackHeight: 4,
  });
  assert.deepEqual(widgetMultiLayout("systemSmall", 4), {
    contentSpacing: 3,
    rowSpacing: 0,
    titleFont: 9,
    valueFont: 9,
    trackHeight: 3,
  });
  assert.deepEqual(widgetMultiLayout("systemMedium", 4), {
    contentSpacing: 4,
    rowSpacing: 1,
    titleFont: 11,
    valueFont: 11,
    trackHeight: 4,
  });
});

test("recovers remaining percent from used data without escaping bounds", () => {
  assert.equal(remainingPercent(40, 80), 40);
  assert.equal(remainingPercent(null, 80), 20);
  assert.equal(remainingPercent(null, -10), 100);
  assert.equal(remainingPercent(null, 140), 0);
  assert.equal(remainingPercent(null, null), null);
});
