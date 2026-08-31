import {
  refreshAllAuthorizedAccounts,
  refreshProviderAccounts,
} from "./refresh";
import { writeLog } from "./logger";
import { requestWidgetReload } from "./widgets";
import { createIntentRefreshRunner } from "./intent-refresh-core";

export const runIntentRefresh = createIntentRefreshRunner({
  refreshAll: () =>
    refreshAllAuthorizedAccounts({ force: true, source: "intent" }),
  refreshProvider: (provider) =>
    refreshProviderAccounts(provider, { force: true, source: "intent" }),
  requestWidgetReload,
  writeLog,
});
