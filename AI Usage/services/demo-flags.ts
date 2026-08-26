/**
 * 演示模式开关与判定（轻量模块）。
 * 小组件等打包敏感路径只需判定函数时从这里引入，
 * 避免拖入 services/demo.ts 的演示账号数据。
 */

const DEMO_KEY = "ai_usage_demo_mode_v1";

export function isDemoMode(): boolean {
  try {
    const value = Storage.get<boolean>(DEMO_KEY);
    return value == null ? true : value === true;
  } catch {
    return true;
  }
}

export function setDemoMode(enabled: boolean): boolean {
  try {
    Storage.set(DEMO_KEY, enabled);
  } catch {
    /* ignore */
  }
  return enabled;
}

export function isDemoAccountId(accountId?: string | null): boolean {
  return Boolean(accountId && accountId.startsWith("demo_"));
}
