import { Widget } from "scripting"
import { UsageWidgetView } from "./components/UsageWidgetView"
import { fetchUsage, getCachedUsage, getReloadMinutes } from "./services/api"
import { getEffectiveSettings } from "./services/credentials"
import { getDefaultProfileId, resolveProfile } from "./services/accounts"
import type { UsageResult } from "./services/types"

function parameterProfileId(): string | null {
  const raw = String(Widget.parameter || "").trim()
  if (!raw) return getDefaultProfileId()
  // 参数支持邮箱、profileId、账号显示名或 JSON 账号信息。
  try {
    const parsed = JSON.parse(raw) as { accountId?: string; email?: string }
    const profile = resolveProfile(parsed.accountId || parsed.email || "")
    return profile?.id || getDefaultProfileId()
  } catch {
    return resolveProfile(raw)?.id || getDefaultProfileId()
  }
}
async function loadResult(profileId: string | null): Promise<UsageResult> {
  if (!profileId) return { ok: false, error: { code: "missing_token", message: "请先添加 Codex 账号" } }
  try {
    const result = await fetchUsage({ force: false, profileId })
    if (result.ok || result.cache) return result
    const cache = getCachedUsage(profileId)
    return cache ? { ok: false, error: result.error, cache } : result
  } catch (e) {
    const cache = getCachedUsage(profileId)
    return { ok: false, error: { code: "unknown", message: "小组件加载失败", detail: e instanceof Error ? e.message : String(e) }, cache: cache || undefined }
  }
}
async function run() {
  const family = String(Widget.family || "systemSmall")
  const profileId = parameterProfileId()
  const settings = getEffectiveSettings(profileId)
  const result = await loadResult(profileId)
  Widget.present(
    <UsageWidgetView result={result} family={family} displayMode={settings.displayMode} focusWindow={settings.focusWindow} widgetLayout={settings.widgetLayout}/>,
    { reloadPolicy: { policy: "after", date: new Date(Date.now() + getReloadMinutes() * 60 * 1000) } },
  )
}
run()
