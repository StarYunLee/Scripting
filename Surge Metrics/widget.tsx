import { Widget } from "scripting"
import { LargeWidgetView } from "./components/LargeWidgetView"
import { MediumWidgetView } from "./components/MediumWidgetView"
import { fetchMetrics, getCachedMetrics } from "./services/metrics"
import { getSettings } from "./services/settings"
import type { MetricsResult } from "./services/types"

async function loadResult(): Promise<MetricsResult> {
  try {
    const result = await fetchMetrics()
    if (result.ok || result.cache) return result
    const cache = getCachedMetrics()
    return cache ? { ok: false, error: result.error, cache } : result
  } catch (error) {
    const cache = getCachedMetrics()
    return {
      ok: false,
      error: {
        code: "unknown",
        message: "小组件加载失败",
        detail: error instanceof Error ? error.message : String(error),
      },
      cache: cache || undefined,
    }
  }
}

async function run() {
  const settings = getSettings()
  const result = await loadResult()
  const family = String(Widget.family || "systemMedium")
  const minutes = Math.max(5, settings.reloadMinutes || 5)
  const nextRequestedAt = new Date(Date.now() + minutes * 60 * 1000)
  const view = family.toLowerCase().includes("large")
    ? <LargeWidgetView result={result}/>
    : <MediumWidgetView result={result}/>

  Widget.present(view, {
    reloadPolicy: {
      policy: "after",
      date: nextRequestedAt,
    },
  })
}

run()
