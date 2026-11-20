import { EXCHANGE_PROMPT } from "./exchange-instructions";
import {
  EXCHANGE_SCHEMA,
  parseExchange,
  type ExchangeData,
} from "./exchange-format";
export const EXCHANGE_EXAMPLE: ExchangeData = parseExchange({
  format: "itemory-data",
  version: 1,
  currency: "CNY",
  items: [
    {
      id: "example-001",
      name: "示例平板（请替换）",
      acquiredOn: "2024-01-10",
      holdingCondition: "in_use",
      acquisitionAmountMinor: 479900,
      category: "数码电子",
      tags: ["示例"],
      channel: "官网",
      warrantyUntil: "2025-01-10",
      valuationMinor: null,
      notes: "此记录仅为结构示例；图片路径必须替换成实际文件。",
      cover: "images/example.png",
      icon: { type: "emoji", value: "📱" },
      moneyEntries: [
        {
          id: "entry-001",
          direction: "expense",
          kind: "accessory",
          amountMinor: 29900,
          occurredOn: "2024-01-08",
          title: "提前购买保护套",
        },
        {
          id: "entry-002",
          direction: "income",
          kind: "other",
          amountMinor: 5000,
          occurredOn: "2024-02-01",
          title: "保价退款",
        },
      ],
      exit: {
        reason: "sold",
        exitedOn: "2024-06-01",
        recoveryAmountMinor: 380000,
        note: "示例出售",
      },
    },
    {
      id: "example-002",
      name: "零元获得示例",
      acquiredOn: "2024-01-01",
      holdingCondition: "idle",
      acquisitionAmountMinor: 0,
    },
    {
      id: "example-003",
      name: "未知价格示例",
      acquiredOn: "2024-01-01",
      holdingCondition: "damaged",
      acquisitionAmountMinor: null,
    },
  ],
});
export const EXCHANGE_README = `# Itemory 数据交换 v1

这不是完整备份。仅新增业务记录，不覆盖或合并已有物品；相同规范化内容与图片会阻止重复导入。修改 ID/内容后不保证识别重复，确认前请核对。
包为标准 ZIP：根目录 data.json + images/ 下 PNG/JPEG。无图可以没有 images/。不支持加密/ZIP64/分卷，文件名用 ASCII 字母数字连字符下划线；不接受远程图片URL、绝对路径、符号链接、嵌套图片目录。

## 输入处理
可处理来源记录、表格、文字或照片，也可只生成一件物品。缺少资料时先询问用户，不输出示例记录冒充实际数据。照片不能确定购入日期、价格或状态时必须询问用户，不得用拍照日期冒充购入日期。

## 顶层
format 必须 itemory-data；version 必须数字 1（格式版本，不是App版本）；currency 必须 CNY；items 为物品数组。
可选 catalogs 包含 categories 与 tags 数组。分类：name 必填，icon 可空，sortOrder 为0~1000000整数，默认数组顺序。标签：name 必填，color 为 #RRGGBB 默认 #007AFF，sortOrder 同上。同名现有目录复用且不覆盖样式。未使用分类标签也能导入。

## 物品
必填 id（1~128个英文字母数字_-，包内唯一）、name（非空）、acquiredOn（获得日期）、holdingCondition（in_use在用/idle闲置/damaged损坏）。同名物品合法，不得自行合并。
可选 acquisitionAmountMinor（购入价）、category（分类名）、tags（标签名称数组）、channel（获得渠道）、warrantyUntil（保修截止）、valuationMinor（当前估值）、notes（备注）、icon、cover、moneyEntries、exit。
可空字段省略等于null；数组省略等于[]。category=null表示未分类而非“其他”。名称首尾去空白、Unicode NFC规范化；目录名称按现有大小写不敏感规则复用，重复标签去重。

## 金额与日期
所有 *Minor 金额单位是人民币分，必须JSON整数：4799元=479900，0.01元=1。null未知，0明确零；禁止字符串金额/负数/小数。单值及累计不得超过9007199254740991。
购入与估值金额允许null/0。流水金额必须>0。不得把购入价重复写成额外支出、出售回收重复写成收入。不得将总投入当作购入价。日均、净成本、累计投入由App计算，不接受对应字段。
日期为真实 YYYY-MM-DD，无时区。购入、流水、退出不得晚于导入当天；保修可为未来。缺失购入日或退出日必须询问用户，不得填今天或推测。UTC按用户或明确来源规则提供的时区转换；未提供时区时先询问，不重复询问已经明确的时区；不接受月份/年份代替完整日期。

## 收支 moneyEntries
每项必填 id（同物品内唯一）、direction（expense/income）、kind（accessory/maintenance/repair/upgrade/other）、amountMinor、occurredOn、title。note可空。流水可早于购入，也可晚于退出；退款/理赔没有独立kind，使用income及合适类型和标题。未知或零金额流水不能直接导入，须用户决定处理。

## 退出 exit
未退出为null；最多一个对象。reason必填sold/gifted/discarded/lost；exitedOn必填且不得早于购入。recoveryAmountMinor出售允许未知null/零/正整数；其余退出必须null。note可空。有exit时显示退出状态，holdingCondition保留退出前状况；缺少该信息需用户确认取值，不得冒充原始事实。

## 图片与图标
cover为images/item-001.png这类路径，限PNG/JPEG（.png/.jpg/.jpeg小写），区分大小写，必须存在且可解码。每物品一个封面，可共用文件。保留透明度，不额外裁切；JPEG导入转PNG。多图片来源必须告知只能接收一个封面，不能静默丢弃。
icon为null或 {"type":"emoji","value":"📷"} 或 {"type":"sfSymbol","value":"camera.fill"}。符号不可用会明确提示后使用默认图标。

## 限制与校验
UTF-8 JSON；不允许注释、尾随逗号、未知字段。最多5000物品，每物品5000流水、200标签；名称/标题<=500字符，备注/渠道<=20000字符。JSON<=8MiB；ZIP<=128MiB；解压总量<=256MiB；单图片文件<=32MiB，图片像素<=2400万且单边<=24000像素。大于限制需拆包，禁止为凑格式而删除记录。
结构Schema不能独立验证真实日期、累计金额、ID唯一和图片存在，App仍做业务校验。错误报告定位字段，修正后重新导入，不支持忽略错误部分写入。
不承接任意自定义字段、内部revision/createdAt/updatedAt/数据库事务/设置；经用户确认后可把不支持信息放入备注。
`;
export function buildImportGuide(): string {
  const minimal = {
    format: "itemory-data",
    version: 1,
    currency: "CNY",
    items: [
      {
        id: "item-001",
        name: "请替换为真实物品",
        acquiredOn: "2024-01-01",
        holdingCondition: "in_use",
      },
    ],
  };
  const fence = "```";
  return [
    "# Itemory AI 转换指令\n\n你是 Itemory 数据转换助手，将用户随附的记录、表格、文字或照片转换为符合本文规范的 ZIP 数据包，并提供单独转换报告。本文是完整任务指令，不是待导入数据。\n\n阅读顺序：正文确定处理流程与确认边界；附录 A 规定字段和文件；附录 B/C 仅展示结构；附录 D 为机器校验规范。规则与 Schema 必须同时满足，如发现矛盾则说明并暂停，不按示例猜测。",
    EXCHANGE_PROMPT,
    EXCHANGE_README.replace(
      "# Itemory 数据交换 v1",
      "## 附录 A：字段与文件规范",
    ).replace(/^## (?!附录)/gm, "### "),
    "## 附录 B：最小单物品示例\n示例日期、名称与状态仅展示结构，不是缺失值默认值。\n" +
      fence +
      "json\n" +
      JSON.stringify(minimal, null, 2) +
      "\n" +
      fence,
    "## 附录 C：完整示例\n图片路径仅用于示范：必须替换为实际文件，本文不附占位图片。\n" +
      fence +
      "json\n" +
      JSON.stringify(EXCHANGE_EXAMPLE, null, 2) +
      "\n" +
      fence,
    "## 附录 D：JSON Schema\n" +
      fence +
      "json\n" +
      JSON.stringify(EXCHANGE_SCHEMA, null, 2) +
      "\n" +
      fence,
  ].join("\n\n");
}
