# AGENTS.md

本文件是给 AI 编程助手的工作约定。人类开发者可参考，但以协作为准。

## 仓库结构

- `AI Usage/`：主项目（Scripting App 的多平台 AI 用量应用 + 小组件）
- `GitHub Stars/`、`Surge Metrics/`：其他活跃项目，各自独立
- `Deprecated/`：不再维护的旧项目（Codex/Claude/Grok Usage），不要改
- `AI-Usage.scripting` 等 `.scripting` 文件：**打包产物**（zip），不要手工编辑

## 开发目录与同步

- 开发工作在 `/Users/gamesme/Developer/code/scripting-workspace/scripts/AI Usage/`（Scripting App 的开发工作区）
- 该目录的内容 ↔ 本仓库的 `AI Usage/` 目录一一对应
- 改动在哪边做都可以，**提交前必须同步两边**（`diff -rq` 确认，忽略 `.DS_Store`；仓库侧多 `LICENSE`，开发目录侧不删它）
- 注意仓库的 `AI Usage/script.json` 可能与开发目录不同步：以**仓库为准**（remoteResource 指向、版本号都在仓库维护）

## 发布节奏（重要）

- **开发期**：小步提交随意，但**不动版本号、不重建安装包、不写 changelog**
- **真机验证通过后**，一个 release 提交做三件事：
  1. `AI Usage/script.json` 的 `version` 升号（bugfix 升 patch，新平台/大功能升 minor）
  2. `AI Usage/changelog.ts` 顶部新增对应版本条目（中文，面向用户）
  3. 重建安装包：仓库根目录执行 `rm -f AI-Usage.scripting && zip -qr AI-Usage.scripting "AI Usage" -x "*.DS_Store" -x "__MACOSX*"`
- README 顶部「当前版本」同步更新
- 一个版本的 changelog 条目只在该版本发布前累积；**发布后就封版**，后续修复开新条目

## remoteResource 规则

- `AI Usage/script.json` 的 `remoteResource.url` **永远指向上游**（`https://raw.githubusercontent.com/StarYunLee/Scripting/main/AI-Usage.scripting`），不要写成 fork（gamesme）地址
- README 里所有安装/导入地址同理，一律用原作者上游地址；Deprecated 项目的地址用上游合并后的 `Deprecated/` 路径

## Widget 代码的硬约束（Scripting 打包器限制）

`AI Usage/widget/` 目录下的文件会被设备端转译器打包进小组件 bundle，该转译器不是完整 TS：

- **禁止** re-export（`export { x }`）——会导致运行时 SyntaxError
- **禁止** 类型谓词（`x is T`）——改用 `flatMap` 等方式窄化
- **禁止** `as const`——用显式类型标注
- **禁止** null 字面量作为 JSX 子节点（`cond ? <X/> : null`）和函数组件 `return null`——设备端构建器会报 `TypeError: null is not an object (evaluating 'e.isInternal')`。一律改用 `<EmptyView />`（从 `scripting` 导入）
- `progressViewStyle="circular"` 的 ProgressView 在 iOS 上是不确定加载指示器（转圈），**不能**用作确定性圆环；画圆环用 `Circle + trim + stroke`

## 验证

- 类型检查：在开发目录运行 `npx --yes -p typescript tsc --noEmit -p tsconfig.json`
- `providers/` 下 `atob` / `URL` / `URLSearchParams` / `Data` 相关的报错是**基线噪音**（dts 未声明运行时全局），不要修它们，也不算新增错误
- 视觉改动无法本地验证，必须真机预览（设置页有小组件预览入口）后才能发版

## 品牌素材规范（assets/）

- Logo 与水印都会被 `renderingMode="template"` 渲染：**alpha 通道即形状，颜色会被丢弃**
- 因此素材必须是**透明背景的字形**，不能是不透明色块/圆角方块/3D 图
- 命名：`<name>-light.png`（浅模式，深色字形）、`<name>-dark.png`（深模式，白色字形）、`watermark-<name>.png`（白色字形，512px）
- 字形约占画布 55%（四周边距对齐既有素材）
- 来源：官方品牌包或 LobeHub 图标库（`@lobehub/icons-static-svg`），SVG → PNG 转换注意是品牌对应主体的标志（如 GitHub Copilot ≠ Microsoft Copilot）

## 套餐/档位映射

- 各平台的订阅档位映射必须基于**实测 API 响应**（真机日志或同类开源项目的真实 payload），不要凭猜测映射内部枚举
- 已有的实测依据：Kimi `LEVEL_*`（onWatch 文档 + 用户实测）、Cursor `GetPlanInfo`/`full_stripe_profile`、Copilot `access_type_sku`（Free 用户的 `copilot_plan` 也是 `individual`，不能只看它）
