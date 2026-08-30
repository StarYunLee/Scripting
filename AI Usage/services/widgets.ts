import { Widget } from "scripting";

let trailingReload: ReturnType<typeof setTimeout> | null = null;

/** 使用官方 API 请求所有 Scripting 小组件重新生成时间线。 */
export function requestWidgetReload(): boolean {
  try {
    // reloadAll 已覆盖 User/Test Widgets；无需连续调用两个 reload API。
    Widget.reloadAll();
    return true;
  } catch {
    return false;
  }
}

/**
 * Storage.set 只会异步落盘，官方没有可等待的完成回调。
 * 先立即请求一次，避免页面退出导致定时器丢失；再合并一次尾随请求，
 * 提高 Widget 进程读取到新值的概率。两次请求都不代表 WidgetKit 会立即调度。
 */
export function requestWidgetReloadAfterStorage(delayMs = 750): void {
  requestWidgetReload();
  if (trailingReload !== null) clearTimeout(trailingReload);
  trailingReload = setTimeout(() => {
    trailingReload = null;
    requestWidgetReload();
  }, delayMs);
}
