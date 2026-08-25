import { Widget } from "scripting";

/** 使用官方 API 立即刷新所有 Scripting 小组件。 */
export function requestWidgetReload(): boolean {
  try {
    Widget.reloadAll();
    return true;
  } catch {
    return false;
  }
}
