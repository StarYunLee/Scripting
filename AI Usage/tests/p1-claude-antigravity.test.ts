import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideClaudeFetchGate } from "../providers/claude/fetch-gate.ts";
import {
  shouldStopCodeAssistHostLoop,
  shouldTryNextCodeAssistHost,
} from "../providers/antigravity/host-failover.ts";

describe("P1-1 Claude fetch gate", () => {
  it("限流期间优先返回未过期成功缓存", () => {
    assert.deepEqual(
      decideClaudeFetchGate({
        force: false,
        cacheIsRecent: true,
        blockedUntil: Date.now() + 60_000,
      }),
      { action: "use_cache" },
    );
  });

  it("无近期缓存时才返回 rate_limited", () => {
    const blockedUntil = Date.now() + 60_000;
    assert.deepEqual(
      decideClaudeFetchGate({
        force: false,
        cacheIsRecent: false,
        blockedUntil,
      }),
      { action: "rate_limited", blockedUntil },
    );
  });

  it("force 刷新在封锁窗口内仍走 rate_limited，不误用缓存短路", () => {
    const blockedUntil = Date.now() + 60_000;
    assert.deepEqual(
      decideClaudeFetchGate({
        force: true,
        cacheIsRecent: true,
        blockedUntil,
      }),
      { action: "rate_limited", blockedUntil },
    );
  });

  it("无封锁且无近期缓存时继续拉取", () => {
    assert.deepEqual(
      decideClaudeFetchGate({
        force: false,
        cacheIsRecent: false,
        blockedUntil: null,
      }),
      { action: "fetch" },
    );
  });
});

describe("P1-2 Antigravity host failover", () => {
  it("403/404 视为可切换 host，继续尝试后续 host", () => {
    assert.equal(shouldTryNextCodeAssistHost(403), true);
    assert.equal(shouldTryNextCodeAssistHost(404), true);
    assert.equal(shouldStopCodeAssistHostLoop(403), false);
    assert.equal(shouldStopCodeAssistHostLoop(404), false);
  });

  it("401/429 等非可切换 4xx 停止 host 循环", () => {
    assert.equal(shouldTryNextCodeAssistHost(401), false);
    assert.equal(shouldTryNextCodeAssistHost(429), false);
    assert.equal(shouldStopCodeAssistHostLoop(401), true);
    assert.equal(shouldStopCodeAssistHostLoop(429), true);
  });

  it("5xx / 网络错误不因 4xx 规则提前停止", () => {
    assert.equal(shouldStopCodeAssistHostLoop(500), false);
    assert.equal(shouldStopCodeAssistHostLoop(undefined), false);
  });
});
