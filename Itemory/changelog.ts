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
      "建立个人物品档案，用封面、分类和标签整理物品，在清单或网格中快速找到想查的那一件。",
      "记录购入、维修和转手的收支，查看每件物品的净支出、持有天数和日均成本。",
      "按年份查看收支趋势和物品排行，在时间线中按购入日期回顾物品，也可以在置物架上按封面浏览。",
      "从订单截图提取物品信息，核对后保存。可选生成透明物品图，也可先在设置中测试模型效果。",
      "将档案、封面和偏好保存为一份 .itemory 备份，换设备时完整恢复；通过 ZIP 数据包向现有档案批量添加物品。",
    ],
  },
] as const satisfies readonly ChangelogEntry[];

export const CURRENT_VERSION = CHANGELOG[0].version;
