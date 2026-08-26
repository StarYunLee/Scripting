export type ChangelogEntry = {
  version: string;
  date: string;
  changes: readonly string[];
};

export const CHANGELOG = [
  {
    version: "1.2.1",
    date: "2026-08-26",
    changes: [
      "修复 Cursor 用量解析失败：正确识别 Dashboard 返回的 unix 毫秒时间戳。",
      "补齐套餐额度回退（GetPlanInfo.includedAmountCents）与 displayMessage 百分比解析。",
      "区分授权失效、HTTP 失败与字段缺失的错误提示。",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-26",
    changes: [
      "新增 Cursor 多账号用量查询，支持 Pro / Ultra / Team / Enterprise 等套餐识别。",
      "新增 Cursor Small / Medium 主屏幕小组件，固定显示计费周期剩余额度。",
      "Cursor 使用 PKCE 浏览器登录与轮询授权，无需粘贴回调地址。",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-08-23",
    changes: [
      "统一各平台主屏幕小组件，以剩余额度显示主数值和进度条，避免用量语义混淆。",
      "移除小组件的已用与剩余切换，并在升级后自动清理旧设置，同时保留现有布局选择。",
      "调整额度风险配色，在剩余不高于 40% 时显示橙色、不高于 15% 时显示红色。",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-22",
    changes: [
      "新增 Google Antigravity 多账号用量查询，支持查看 Gemini Model 与 Claude and GPT 的 5 小时和每周额度。",
      "新增 Antigravity Small / Medium 主屏幕小组件，支持单用量详情和三种双额度概览组合。",
      "优化 Antigravity 授权、套餐识别和刷新体验，并支持通过 App Intent 独立刷新。",
      "扩充演示模式，为各平台主要套餐提供独立样例账号，并支持预览 Antigravity 小组件。",
    ],
  },
  {
    version: "1.0.7",
    date: "2026-08-22",
    changes: [
      "适配 Claude 最新用量信息，支持显示更多模型专属周限额度。",
      "优化 Claude 在空数据、接口限流和缓存回退情况下的显示稳定性。",
    ],
  },
  {
    version: "1.0.6",
    date: "2026-08-22",
    changes: [
      "修正 Grok 共享周额度显示不准确的问题。",
      "优化 Grok 套餐识别和刷新稳定性。",
    ],
  },
  {
    version: "1.0.5",
    date: "2026-08-22",
    changes: [
      "提升 Codex 用量查询与官方客户端的兼容性。",
      "补充 Codex 额度状态、套餐和消费控制信息。",
    ],
  },
  {
    version: "1.0.4",
    date: "2026-08-21",
    changes: [
      "统一应用和小组件的用量风险配色，以绿色、橙色和红色直观显示额度状态。",
      "加粗应用用量卡进度条，提升玻璃背景下的辨识度。",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-08-17",
    changes: ["修正 Grok 周用量重置后百分比显示异常的问题。"],
  },
  {
    version: "1.0.2",
    date: "2026-08-16",
    changes: ["优化用量卡刷新状态，准确区分实时数据、缓存、失败和空数据。"],
  },
  {
    version: "1.0.1",
    date: "2026-08-16",
    changes: [
      "新增快捷指令刷新入口，可手动或定时刷新全部已授权账号。",
      "刷新完成后自动请求更新主屏幕小组件。",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-16",
    changes: [
      "正式推出 AI Usage，统一管理 Codex、Grok 与 Claude 多个账号的用量和重置时间。",
      "支持 Small / Medium 主屏幕小组件，并可按账号配置额度窗口和显示方式。",
      "支持应用内授权、单账号刷新、批量刷新和缓存回退。",
      "提供演示模式、背景主题、运行记录和版本更新日志。",
    ],
  },
] as const satisfies readonly ChangelogEntry[];

export const CURRENT_VERSION = CHANGELOG[0].version;
