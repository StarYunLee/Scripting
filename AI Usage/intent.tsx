import { Intent, Script } from "scripting";
import { refreshAllAuthorizedAccounts } from "./services/refresh";
import { writeLog } from "./services/logger";
import { requestWidgetReload } from "./services/widgets";

async function run() {
  try {
    const summary = await refreshAllAuthorizedAccounts({
      force: true,
      source: "intent",
    });
    requestWidgetReload();
    writeLog({
      level: summary.failed ? "warning" : "info",
      source: "intent",
      category: "refresh",
      event: "shortcut.refresh_all.completed",
      message: `快捷指令刷新完成：成功 ${summary.succeeded}，失败 ${summary.failed}`,
    });
    Script.exit(
      Intent.text(
        `已刷新 ${summary.succeeded} 个账号，失败 ${summary.failed} 个。`,
      ),
    );
  } catch (error) {
    writeLog({
      level: "error",
      source: "intent",
      category: "refresh",
      event: "shortcut.refresh_all.failed",
      message: "快捷指令刷新失败",
      code: error instanceof Error ? error.name : "unknown",
    });
    Script.exit(Intent.text("刷新失败"));
  }
}

void run();
