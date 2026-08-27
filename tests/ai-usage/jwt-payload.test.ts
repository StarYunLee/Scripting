import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJwtPayload } from "../../AI Usage/services/jwt-payload";

function token(payload: Record<string, unknown>): string {
  const part = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `header.${part}.signature`;
}

test("decodes Unicode and namespaced claims from base64url JWT payloads", () => {
  assert.deepEqual(
    parseJwtPayload(
      token({
        email: "用户@example.com",
        "https://api.openai.com/profile": { email: "nested@example.com" },
      }),
    ),
    {
      email: "用户@example.com",
      "https://api.openai.com/profile": { email: "nested@example.com" },
    },
  );
});

test("returns null for blank malformed or non-object payloads", () => {
  assert.equal(parseJwtPayload(null), null);
  assert.equal(parseJwtPayload("not-a-jwt"), null);
  assert.equal(parseJwtPayload("header.%%%.signature"), null);
  const arrayPart = Buffer.from("[]", "utf8").toString("base64url");
  assert.equal(parseJwtPayload(`header.${arrayPart}.signature`), null);
});
