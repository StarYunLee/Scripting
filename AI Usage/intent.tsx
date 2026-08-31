import { Intent, Script } from "scripting";
import { runIntentRefresh } from "./services/intent-refresh";

async function run() {
  try {
    const summary = await runIntentRefresh({ kind: "all" });
    Script.exit(
      Intent.text(
        `已刷新 ${summary.succeeded} 个账号，失败 ${summary.failed} 个。`,
      ),
    );
  } catch {
    Script.exit(Intent.text("刷新失败"));
  }
}

void run();
