# AI Usage

<table>
  <tr>
    <td align="center" width="33%"><img src="assets/ai-usage-preview-small.jpeg" alt="AI Usage Small 小组件预览" /></td>
    <td align="center" width="33%"><img src="assets/ai-usage-preview-medium.jpeg" alt="AI Usage Medium 小组件预览" /></td>
    <td align="center" width="33%"><img src="assets/ai-usage-preview-app.jpeg" alt="AI Usage 应用预览" /></td>
  </tr>
</table>

面向 [Scripting App](https://scriptingapp.github.io/) 的非官方多平台用量查看应用。在一个项目里管理 Codex、Grok、Claude、Antigravity、Cursor、Kimi Code、GitHub Copilot、Z.ai（智谱）与 MiniMax 的多账号用量、主屏幕小组件和自动化刷新。

当前版本：`1.8.0`

> 本项目不是 OpenAI、xAI、Anthropic、Google、Cursor、Moonshot / Kimi、GitHub Copilot、Z.ai / 智谱、MiniMax 或 Scripting App 官方产品，与上述平台无隶属或合作关系。

## 功能

- 统一管理 Codex、Grok、Claude、Antigravity、Cursor、Kimi Code、GitHub Copilot、Z.ai、MiniMax 多个账号
- **用量总览**与**小组件总览**可分别选择要展示的账号与额度条目
- **总用量小组件**（参数 `dashboard`）：Small 列表 / Medium 圆环 / Large 进度条，多账号一览
- 小组件隐私选项：可单独开关账号邮箱、账号 ID、套餐档位徽章
- 统一文案术语表（`copy/labels.ts`）：应用内中文 + 小组件英文缩写（如 5h / Weekly / API）
- Access Token、Refresh Token 和相关身份凭据保存在本机 Keychain
- Token 到期前自动刷新
- 主屏幕小组件支持 Small、Medium、Large，单账号布局按账号独立保存
- 小组件主数值和进度条固定显示剩余额度
- 统一绿 / 橙 / 红风险配色：剩余不高于 40% 显示橙色，不高于 15% 显示红色
- 网络失败或接口限流时回退最近一次成功缓存
- 内置只读演示模式，可在未授权时预览界面和小组件
- 支持快捷指令与 App Intent，手动或定时刷新全部账号
- 运行记录已脱敏，不输出 Token 或完整账号标识

## 系统要求

- iPhone 或 iPad
- 已安装 Scripting App
- 具备对应平台用量查询资格的账号
- 需要联网完成 OAuth 和用量查询
- 不需要 Scripting Pro

## 安装

1. 下载本项目目录或发布的 `AI-Usage.scripting` 安装包。
2. 将 `AI Usage` 导入 Scripting App。
3. 在 Scripting 中运行 `AI Usage`，进入用量页。
4. 按下方步骤完成对应平台的 OAuth。
5. 在主屏幕添加 Scripting 小组件，并选择 `AI Usage`。

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/AI-Usage.scripting
```

## OAuth 登录

在用量页点击右上角 `+` 选择平台后，应用会打开对应授权页。完成登录后，把回调内容复制回应用并提交。

### Codex

- 回调：`http://localhost:1455/auth/callback?...`
- 应用会尽量在本机自动捕获回调并完成登录（需 Scripting 提供 HttpServer 能力）
- 若未自动完成：复制 Safari 地址栏中的完整回调地址并粘贴提交

### Grok

- 回调：`http://127.0.0.1:56122/callback?...`
- 可复制完整回调地址，或页面显示的一次性代码

### Claude

- 回调页会显示一次性授权码，通常形如 `code#state`
- 复制整段授权码

### Antigravity

- 回调：`http://localhost:51121/oauth-callback?...`
- 复制 Safari 地址栏中的完整回调地址

### Cursor

- 应用会打开 `cursor.com/loginDeepControl` 授权页
- 在浏览器完成 Cursor 登录后返回应用，无需粘贴内容，直接点击“提交并完成授权”

### Kimi Code

- 应用会打开 Kimi 设备授权页（`auth.kimi.com`）
- 在浏览器完成授权后返回应用，无需粘贴内容，直接点击“提交并完成授权”

### GitHub Copilot

- 应用会打开 GitHub 设备授权页（`github.com/login/device`）
- 在页面输入应用显示的设备码完成授权后返回应用，无需粘贴内容，直接点击“提交并完成授权”

### Z.ai / 智谱

- 应用会打开 API Key 控制台（`z.ai` 国际站）
- 复制 API Key 后粘贴到应用并提交；会自动探测国际站（`api.z.ai`）或国内站（`bigmodel.cn`）

### MiniMax

- 应用会打开 Token Plan 控制台（`platform.minimax.io`）
- 复制 Subscription Key 后粘贴到应用并提交；会自动探测国际站（`api.minimax.io`）或国内站（`api.minimaxi.com`）

OAuth 临时状态有效期为 10 分钟。Authorization Code 通常只能交换一次；授权失败或超时后请重新开始。

> 回调 URL 和一次性授权码属于短期敏感凭据。不要截图、公开或发送给他人。

## 多账号与小组件参数

- 每个账号拥有独立的 Keychain 凭证和用量缓存
- 可以同时添加同一平台或多个平台的账号
- 小组件参数为空时，若只有一个已授权账号，会自动选择该账号
- 多账号时请填写对应参数，每个主屏幕小组件可以绑定不同账号
- 布局按账号独立保存；刷新频率对所有账号生效

### 单账号小组件

绑定某个账号的用量小组件：

1. 打开目标账号详情页，点击“复制组件参数”
2. 长按主屏幕小组件，选择“编辑小组件”
3. 将参数粘贴到“参数”

参数格式：

```text
provider:profileId
```

### 总用量小组件（dashboard）

在设置 → **小组件总览** 中选择要展示的账号与额度条目，然后：

1. 点击“复制总览组件参数”
2. 编辑主屏幕 AI Usage 小组件，将参数粘贴为 `dashboard`

| 尺寸 | 布局 | 说明 |
|------|------|------|
| Small | 文本列表 | 无标题，紧凑显示剩余百分比 |
| Medium | 圆环 | 中心为剩余整数，超出时最多双行 |
| Large | 进度条 | 显示「总用量」标题与完整条目 |

应用内 **用量总览** 与 **小组件总览** 的展示偏好**互不影响**，分别存储。

## 小组件显示

小组件不再提供“已用 / 剩余”切换。主数值、概览数值和进度条长度都固定为剩余额度；颜色仍按已用比例判断风险。

- 绿色：剩余高于 40%
- 橙色：剩余不高于 40%、高于 15%
- 红色：剩余不高于 15%

### 总用量（dashboard）

- 各尺寸共用统一缩写：5h / Weekly / Monthly / Auto / Total / API 等
- Antigravity 复合标签显示为 `Agy · Gemini · 5h` 等形式
- 默认隐藏邮箱与账号 ID；可在小组件总览 → 隐私与显示 中开启

### Small（单账号）

- Codex / Claude / Antigravity：可按账号选择单额度详情或双额度概览
- Grok：固定展示每周额度
- Cursor：固定展示 Auto / 总计 / 第三方 API，有资格时附带 Grok Bot 周额度
- Kimi Code：固定展示 5 小时与每周额度
- GitHub Copilot：固定展示 AI Credits / Chat / Completions（按套餐自动选取可用额度）
- Z.ai：固定展示 5 小时与每周额度（有则附带每月 / Web Search）
- MiniMax：固定展示 5 小时与每周额度

### Medium（单账号）

- 单额度详情用大数字突出剩余额度，右上角显示已用百分比
- 双额度概览同时展示两个额度窗口的剩余百分比、进度条和重置时间

所选窗口缺失时，对应位置显示 `—`，不会改用其他额度。

## 小组件设置

布局选项只作用于当前账号；刷新频率对全部账号生效。升级后会自动清理旧的“已用 / 剩余”切换设置，并保留现有布局选择。

### Codex

- 组件布局：单额度详情、双额度概览
- 单额度详情可选择 5 小时、每周或每月额度

### Claude

- 组件布局：双额度概览、单额度详情
- 概览组合和单额度窗口可按账号选择

### Antigravity

- 单额度详情：Gemini Model 每周、Claude and GPT 每周
- 双额度概览：Gemini 5 小时 + 每周、Claude and GPT 5 小时 + 每周、双方每周额度

### Grok

- 固定显示每周额度，不再提供账号级显示切换

### Cursor

- 固定展示 Auto、总计、第三方 API 三个计费周期额度窗口的剩余百分比
- 有 Grok Bot 包含额度时，额外展示独立的 **Grok Bot** 周额度（`GetSandUsageStatus`）
- 无 Bot 资格或接口失败时不影响前三个窗口

### Kimi Code

- 固定展示 5 小时与每周两个额度窗口的剩余百分比
- 套餐等级对齐官方 Andante / Moderato / Allegretto / Allegro；缺失窗口时显示 `—`

### 刷新频率

- 5 分钟
- 10 分钟
- 15 分钟
- 30 分钟（默认）
- 60 分钟

iOS WidgetKit 可能根据系统调度延后刷新。所选时间是请求的最早刷新时间，不是严格定时器。更准时的更新请配合快捷指令自动化。

## 数据来源

用量数据来自各平台官方客户端当前使用的认证和内部用量接口，不是面向第三方承诺长期稳定的公开 API。

- Codex：OpenAI OAuth 与 ChatGPT 内部用量接口
- Grok：xAI OAuth 与 Grok Build / CLI 订阅额度接口
- Claude：Anthropic OAuth 与 Claude Code 用量接口
- Antigravity：Google OAuth 与 Antigravity / Code Assist 用量接口
- Cursor：Cursor PKCE 登录与 Dashboard 用量接口（`GetCurrentPeriodUsage` + 可选 `GetSandUsageStatus` 获取 Grok Bot，Enterprise 回退 `/auth/usage`）
- Kimi Code：设备码 OAuth 与 Coding usages 接口（`/coding/v1/usages`）
- GitHub Copilot：GitHub 设备码 OAuth 与 Copilot 内部用量接口（`/copilot_internal/user`）
- Z.ai / 智谱：API Key 认证与 monitor 用量接口（`/api/monitor/usage/quota/limit`，国际站 / 国内站自动探测）
- MiniMax：Subscription Key 认证与 Coding / Token Plan remains 接口（`/coding_plan/remains`、`/token_plan/remains`，国际站 / 国内站自动探测）

服务端更新后，路径、字段或访问策略可能变化。

## 自动化刷新

小组件日常依赖系统时间线调度。如需更稳定地更新桌面用量，可通过快捷指令创建定时自动化：

1. 打开 iOS 快捷指令 → 自动化
2. 添加动作：Scripting → 运行意图脚本
3. 脚本选择 `AI Usage`
4. 关闭“运行前询问”

该动作会拉取全部已授权账号的最新用量，并请求刷新主屏幕小组件。也可以使用系统 App Intent 按平台或全量刷新。

## 隐私与安全

- OAuth Token 仅保存在当前设备的 Scripting Keychain
- 账号注册表、小组件设置和用量缓存仅保存在本机 Scripting Storage
- 项目不通过作者服务器转发登录或用量数据
- 源代码和正常导出的安装包不包含你的账号、邮箱、Token 或用量缓存
- 运行记录只保留请求状态和脱敏摘要，不输出 Token、完整邮箱或完整响应
- 删除账号时会同时删除该账号的本机凭证、用量缓存和独立布局设置
- 不要分享 OAuth 回调 URL、一次性授权码、Token、Keychain 导出或完整 App 容器备份
- Antigravity 使用 Google 已公开的官方桌面客户端 OAuth 凭据完成登录，不是作者个人云项目密钥；你的账号 Token 仍只保存在本机

## 已知限制

- 各平台内部用量接口可能随时变化
- OAuth 成功不代表所有账号都具有对应用量查询资格
- 账号实际拥有的额度窗口由服务端决定，缺失窗口显示 `—`
- WidgetKit 不保证严格按照所选分钟数刷新
- Scripting 目前不支持注册 Extra Large 小组件；总用量仅适配 Small / Medium / Large
- 演示模式只用于预览界面，不会写入真实账号或发起授权请求

## 项目结构

```text
AI Usage/
├── assets/                   平台 Logo、水印与展示图
├── components/               共享 UI 与用量卡片
├── copy/                     统一文案术语表（labels.ts）
├── pages/                    用量、设置、账号详情、日志页
├── providers/                各平台 OAuth 与用量适配
├── services/                 刷新编排、配色、设置、演示与存储
├── widget/                   小组件分发、Loader 与平台布局
│   └── dashboard/            总用量小组件（dashboard 参数）
├── app_intents.tsx           系统 App Intent
├── index.tsx                 应用入口
├── intent.tsx                快捷指令刷新入口
├── widget.tsx                小组件入口
├── changelog.ts              版本更新日志
├── script.json               Scripting 项目元数据
├── LICENSE                   MIT License
└── README.md
```

## 免责声明

本项目仅用于查看本人账号的用量信息。请自行评估内部接口变更、账号策略和第三方脚本带来的风险，并遵守 OpenAI、xAI、Anthropic、Google、Cursor、Moonshot / Kimi 与 Scripting App 的服务条款。项目不保证接口永久可用，也不对用量数据延迟、解析差异、限流或服务端策略变化承担责任。
