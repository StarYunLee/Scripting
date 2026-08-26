import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { fetchUsage } from "./services/api"
import { listAccounts, getProfileAccessToken } from "./services/accounts"

export const RefreshCodexUsageIntent = AppIntentManager.register({
  name: "RefreshCodexUsageIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    // AppIntent 无法可靠获取触发它的小组件参数，因此刷新全部已授权账号，避免串号。
    for (const account of listAccounts()) {
      if (!getProfileAccessToken(account.id)) continue
      try { await fetchUsage({ force: true, profileId: account.id }) } catch { /* continue */ }
    }
    try { Widget.reloadUserWidgets() } catch { Widget.reloadAll() }
  },
})
