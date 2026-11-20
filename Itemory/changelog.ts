export type ChangelogEntry = {
  readonly version: string;
  readonly date: string;
  readonly changes: readonly string[];
};

export const CHANGELOG = [
  {
    version: "1.0.0",
    date: "2026-10-30",
    changes: [
      "正式推出 Itemory 个人物品档案与成本管理应用，支持记录物品封面、分类、标签、购入信息、保修、估值与备注，并提供列表与网格双视图浏览、搜索、多维筛选与排序。",
      "支持全周期收支与持有状态管理：可记录配件、保养、维修等支出与普通收入，支持出售、赠送、丢弃、遗失登记及恢复持有，自动核算净投入、持有天数与每日成本。",
      "提供多维统计报表与时光回顾：支持按全部时间或指定年份查看资产总览、状态分布、分类投入、收支趋势、陪伴时长与物品排行，并可通过时间线与置物架回看物品陪伴历程。",
      "内置「AI 识图录入」与透明物品图生成：支持连接兼容 OpenAI 格式的视觉与图像模型，从订单截图提取物品信息填入表单，并可异步生成透明背景物品图，支持自定义提示词与独立效果测试。",
      "提供可靠的本机数据安全与迁移能力：基于 SQLite 与待决事务日志保障本机读写一致性，支持一键导出与单次确认自动重开的完整备份（.itemory），以及带重复检测与 AI 转换指引的开放数据交换（.zip）；支持原生列表与 Liquid Glass 玻璃卡片双主题。",
    ],
  },
] as const satisfies readonly ChangelogEntry[];

export const CURRENT_VERSION = CHANGELOG[0].version;
