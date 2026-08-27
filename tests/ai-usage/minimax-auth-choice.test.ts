import assert from "node:assert/strict";
import test from "node:test";
import { parseMinimaxAuthChoice } from "../../AI Usage/providers/minimax/auth-choice";

test("maps the explicit MiniMax station action sheet choices", () => {
  assert.equal(parseMinimaxAuthChoice(0), "intl");
  assert.equal(parseMinimaxAuthChoice(1), "cn");
  assert.equal(parseMinimaxAuthChoice(-1), null);
  assert.equal(parseMinimaxAuthChoice(2), null);
});
