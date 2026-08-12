import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { fetchMetrics } from "./services/metrics"

export const RefreshSurgeMetricsIntent = AppIntentManager.register({
  name: "RefreshSurgeMetricsIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    try {
      // Pull the native counters immediately and update the local snapshot cache.
      await fetchMetrics()
    } catch {
      // Still request a timeline reload so the widget can surface cache/error state.
    }
    try {
      Widget.reloadUserWidgets()
    } catch {
      Widget.reloadAll()
    }
  },
})
