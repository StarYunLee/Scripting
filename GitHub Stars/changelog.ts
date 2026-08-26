export type ChangelogEntry = {
  readonly version: string;
  readonly date: string;
  readonly changes: readonly string[];
};

export const CHANGELOG = [
  {
    version: "1.0.0",
    date: "2026-08-26",
    changes: [
      "新增仓库 Tab，可浏览、搜索、筛选和排序本人公开仓库；已设置为 GitHub Pinned 的仓库会优先显示，并维护描述、Homepage、Topics 与 Issues。",
      "Fork 仓库支持将默认分支同步到上游最新状态，发生冲突时不会强制覆盖。",
      "设置页可按需显示本人私有仓库；开启需 Classic PAT 的 repo 权限，关闭后立即清除私有仓库元数据缓存。",
      "归档仓库前需要输入仓库名称确认，避免误触高影响操作。",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-08-25",
    changes: [
      "Stars 页支持粘贴仓库链接或 owner/repo 手动添加 Star。",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-08-25",
    changes: [
      "个人资料卡新增 GitHub 主页钉选仓库，点击即可在 App 内预览。",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-08-25",
    changes: [
      "Stars 页改为右上角原生菜单筛选语言、列表与排序，不再使用弹窗选择。",
      "调整 Scripting 列表卡片底色，黑色 GitHub 标志在浅灰底上更易识别。",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-08-25",
    changes: [
      "Stars 页支持长按仓库卡片取消 Star，确认后同时从所有自定义列表中移除。",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-08-22",
    changes: [
      "个人资料卡新增 GitHub 贡献热力图与历史年份切换，并支持常用语言技术栈彩色比例条。",
      "补充关注者、关注中等核心资产统计，重构个人档案为居中对齐的 Liquid Glass 视觉风格。",
      "应用正式更名为 GitHub Stars，并优化首页秒开加载与长列表搜索流畅度。",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-08-19",
    changes: [
      "支持创建、重命名与删除自定义列表，并在弹窗中支持多选维护仓库所属列表。",
      "优化仓库卡片与列表操作菜单的触控交互，避免与网页预览产生误触冲突。",
      "完善设置页 Token 权限说明，新增创建 Personal Access Token (classic) 的完整引导。",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-08-18",
    changes: [
      "仓库卡片新增所属自定义列表标签展示，多列表归属一目了然。",
      "优化列表归属数据同步机制，下拉刷新时自动拉取并更新最新的列表归属关系。",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-08-18",
    changes: [
      "仓库卡片接入 GitHub 官方编程语言色彩，并精简 Star 与 Fork 等统计指标排版。",
      "优化界面渲染逻辑与列表缓存策略，提升跨标签页切换时的响应速度与流畅度。",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-08-18",
    changes: [
      "支持浏览已加星仓库与自定义列表，提供关键字即时搜索与 App 内网页预览能力。",
      "个人访问令牌采用本地安全存储，支持离线数据缓存与下拉刷新。",
    ],
  },
] as const satisfies readonly ChangelogEntry[];

export const CURRENT_VERSION = CHANGELOG[0].version;
