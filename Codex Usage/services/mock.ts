import type { CodexAccountProfile, LimitWindow, UsageSnapshot } from "./types"

export const MOCK_PROFILE_ID = "mock_codex_pro_20x"
export const MOCK_PROFILE_EMAIL = "mock.pro20x@codex.local"

export const MOCK_PROFILE: CodexAccountProfile = {
  id: MOCK_PROFILE_ID,
  name: "Mock · Pro 20x",
  email: null,
  accountId: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
}

export function isMockProfile(profileId?: string | null): boolean {
  if (!profileId) return false
  const query = profileId.trim().toLowerCase()
  return query === MOCK_PROFILE_ID || query === MOCK_PROFILE_EMAIL || query === MOCK_PROFILE.name.toLowerCase()
}

function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}
function window(id: string, name: LimitWindow["name"], label: string, usedPercent: number, resetOffsetMs: number, windowSeconds: number): LimitWindow {
  const resetAt = futureIso(resetOffsetMs)
  return {
    id,
    name,
    label,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetAt,
    resetAtMs: new Date(resetAt).getTime(),
    windowSeconds,
  }
}

/** 只读演示数据：时间按当前时刻滚动，避免 Mock 权益自然过期。 */
export function createMockUsageSnapshot(): UsageSnapshot {
  const fiveHour = window("mock:five_hour", "five_hour", "5 小时", 68, 2 * 3_600_000 + 26 * 60_000, 5 * 3_600)
  const weekly = window("mock:weekly", "weekly", "每周", 43, 4 * 86_400_000 + 9 * 3_600_000 + 18 * 60_000, 7 * 86_400)
  return {
    windows: [fiveHour, weekly],
    fiveHour,
    weekly,
    monthly: null,
    planType: "pro",
    planLabel: "Pro 20x",
    resetCreditsAvailable: 3,
    resetCreditExpirations: [
      futureIso(5 * 86_400_000 + 3 * 3_600_000),
      futureIso(17 * 86_400_000 + 8 * 3_600_000),
      futureIso(29 * 86_400_000 + 12 * 3_600_000),
    ],
    fetchedAt: new Date().toISOString(),
    source: "live",
    raw: {},
  }
}
