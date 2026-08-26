# AGENTS.md

本文件是给 AI 编程助手的工作约定。人类开发者可参考，但以协作为准。

## 仓库结构

- `AI Usage/`：主项目（Scripting App 的多平台 AI 用量应用 + 小组件）
- `GitHub Stars/`、`Surge Metrics/`：其他活跃项目，各自独立
- `Deprecated/`：不再维护的旧项目（Codex/Claude/Grok Usage），不要改
- `AI-Usage.scripting` 等 `.scripting` 文件：**打包产物**（zip），不要手工编辑
- `tools/`：仓库侧辅助脚本（如 `check-syntax.js` 语法检查），不同步到开发目录

## 开发目录与同步

- 开发工作在 `/Users/gamesme/Developer/code/scripting-workspace/scripts/AI Usage/`（Scripting App 的开发工作区）
- 该目录的内容 ↔ 本仓库的 `AI Usage/` 目录一一对应
- 改动在哪边做都可以，**提交前必须同步两边**（`diff -rq` 确认，忽略 `.DS_Store`；仓库侧多 `LICENSE`，开发目录侧不删它）
- 注意仓库的 `AI Usage/script.json` 可能与开发目录不同步：以**仓库为准**（remoteResource 指向、版本号都在仓库维护）

## 发布节奏（重要）

- **开发期**：小步提交随意，但**不动版本号、不重建安装包、不写 changelog**
- **真机验证通过后**，一个 release 提交做四件事：
  1. `AI Usage/script.json` 的 `version` 升号（bugfix 升 patch，新平台/大功能升 minor）
  2. `AI Usage/changelog.ts` 顶部新增对应版本条目（中文，面向用户）
  3. **先跑通语法检查**：仓库根目录执行 `npx --yes -p typescript@5 node tools/check-syntax.js "AI Usage"`，0 错误才继续
  4. 重建安装包（**扁平结构**：压缩包根目录直接是 `script.json`，不能套一层 `AI Usage/`）：仓库根目录执行 `rm -f AI-Usage.scripting && (cd "AI Usage" && zip -qr ../AI-Usage.scripting . -x "*.DS_Store" -x "__MACOSX*")`
- README 顶部「当前版本」同步更新
- 一个版本的 changelog 条目只在该版本发布前累积；**发布后就封版**，后续修复开新条目

## remoteResource 规则

- `AI Usage/script.json` 的 `remoteResource.url` **永远指向上游**（`https://raw.githubusercontent.com/StarYunLee/Scripting/main/AI-Usage.scripting`），不要写成 fork（gamesme）地址
- README 里所有安装/导入地址同理，一律用原作者上游地址；Deprecated 项目的地址用上游合并后的 `Deprecated/` 路径

## Widget 代码的硬约束（Scripting 打包器限制）

`AI Usage/widget/` 目录下的文件会被设备端转译器打包进小组件 bundle，该转译器不是完整 TS：

- **禁止** re-export（`export { x }`）——会导致运行时 SyntaxError
- **禁止** 类型谓词（`x is T`）——改用 `flatMap` 等方式窄化
- 对象字面量的 key 必须加引号，尤其是非 ASCII key（`as const` 本身在现役代码中正常使用，不再禁止——c955792 的 SyntaxError 真凶是未加引号的中文 key 等，as const 是被连坐的）
- **条件渲染用 `{cond ? <X/> : null}`，与官方文档一致**（llms-full.txt 中这是标准写法，MapKit 示例甚至在 map 回调里 `return null`）。`EmptyView` 未在官方文档中列为导出，**不要新增使用**；v1.8.2 已改成 EmptyView 的约 30 处保留不回滚（能跑就不动），但也别再扩散。历史上 Medium 构建失败（`e.isInternal`）的真凶是下一条的 circular ProgressView，不是 null 子节点
- `progressViewStyle="circular"` 的 ProgressView 在 iOS 上是不确定加载指示器（转圈），**不能**用作确定性圆环；画圆环用 `Circle + trim + stroke`
- **内存与求值预算**：iOS 对小组件有约 30MB 内存限制，渲染失败/空白通常是内存问题；`Widget.present(...)` 后当前执行上下文立即销毁；小组件是一次性渲染，`widget.tsx` 的整个 import 图每次 timeline reload 都会重新解析求值。新增 widget 代码前先掂量 import 图的增量（参考：v1.9.0 设置面板功能让 import 图涨了 1832 行/52KB，抵消了同期 perf 重构的减量）

## 性能约束

- `index.tsx` / `widget.tsx` 都是全静态 import，Scripting **没有动态 `import()`**（官方文档全文 0 命中）——import 图 = 每次启动/渲染的成本，新增视图前先掂量增量
- 网络刷新一律用有界并发（`services/refresh.ts` 的 `inBatches`）：应用侧每批 3~4，小组件 2~3；不要 `for + await` 串行，也不要无上限 `Promise.all(全部)`；错误隔离必须保持（单个账号失败不影响其它）
- App 启动的刷新必须尊重 `settings.reloadMinutes`（默认 30 分钟）；provider 内部的 `MIN_LIVE_INTERVAL_MS`（3 分钟）只是防连点下限，不是启动闸门的依据
- 迁移不挡首帧：9 家 provider 的读取路径（`getAccountRegistry`）各自惰性触发 `ensure`，顶层 `ensureAllMigrations` 只需尽早、无需最先
- 渲染路径避免每次重渲染都同步读 Storage：用 `useMemo`/`useState` 初值 + 变更信号（tick/epoch）重取

参考数字（import 图体积）：

```
index.tsx  图: v1.1.2 286.5 KB -> v1.9.0 594.0 KB
widget.tsx 图: v1.1.2 308.7 KB -> v1.9.0 710.8 KB
```

## 验证

- 语法检查（仓库根目录可跑，只查语法不做类型检查，不需要 dts）：`npx --yes -p typescript@5 node tools/check-syntax.js "AI Usage"`；release 前必跑
- 类型检查（**只能在开发目录跑**，`AI Usage/` 下没有 tsconfig.json）：`/Users/gamesme/Developer/code/scripting-workspace` 下执行 `npx --yes -p typescript tsc --noEmit -p tsconfig.json`
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
