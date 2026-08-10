# Claude Usage

面向 [Scripting App](https://scriptingapp.github.io/) 的非官方 Claude Code 用量小组件。支持 Anthropic OAuth、多账号、5 小时/每周/Fable 每周额度，以及 Small、Medium 两种尺寸。

> 本项目不是 Anthropic 或 Claude 官方产品，与 Anthropic 无隶属或合作关系。

## 功能

- Anthropic Authorization Code OAuth + PKCE
- Access Token、Refresh Token 保存在本机 Keychain
- Token 到期前自动刷新
- 多账号管理，每个账号独立保存凭证和用量缓存
- 读取 5 小时、每周及 Fable 每周额度
- 支持“额度概览”和“额度详情”两种组件布局
- 支持显示已用或剩余百分比
- 展示进度条、更新时间和重置时间
- 网络失败或接口限流时回退最近一次成功缓存
- 支持 Small、Medium 主屏幕小组件
- 支持 AppIntent 手动刷新

## 系统要求

- iPhone 或 iPad
- 已安装 Scripting App
- 具备 Claude Code 使用资格的 Claude 账号
- 个人账号通常需要 Claude Pro 或 Max；Free 账号会在 Claude Code 授权页面被拦截
- 需要联网完成 OAuth 和用量查询
- 不需要 Scripting Pro

## 安装

1. 下载项目目录或发布的 `.scripting` 安装包。
2. 将 `Claude Usage` 导入 Scripting App。
3. 在 Scripting 中运行 `Claude Usage`，进入账号和小组件设置页。
4. 按下方步骤完成 Anthropic OAuth。
5. 在主屏幕添加 Scripting 小组件，并选择 `Claude Usage`。

## OAuth 登录

Claude Usage 使用 Claude Code 当前的 Authorization Code + PKCE 登录流程：

- Authorize：`https://claude.ai/oauth/authorize`
- Token：`https://console.anthropic.com/v1/oauth/token`
- Callback：`https://console.anthropic.com/oauth/code/callback`
- Scope：`org:create_api_key user:profile user:inference`

登录步骤：

1. 在设置页点击“添加 Claude 账号”或当前账号下的“授权此账号”。
2. 系统浏览器会打开 Anthropic 登录和授权页面。
3. 完成授权后，页面会显示一次性授权码，通常形如 `code#state`。
4. 复制整段授权码并返回 Claude Usage。
5. 粘贴到“Anthropic 授权码”，点击“提交授权码并完成登录”。
6. 授权成功后，脚本会刷新账号用量。

OAuth 临时状态有效期为 10 分钟。Authorization Code 通常只能交换一次；授权失败或超时后请重新开始。

> 授权码属于短期敏感凭据。不要截图、公开或发送给他人。

## 多账号与小组件参数

Claude Usage 支持同时添加多个账号：

- 每个账号拥有独立的 Keychain 凭证和用量缓存；
- 可以设置一个默认账号；
- 小组件参数为空时显示默认账号；
- 每个主屏幕小组件可以绑定不同账号。

绑定账号的方法：

1. 在 Claude Usage 的“主屏幕多账号小组件”中复制目标邮箱；
2. 长按主屏幕小组件；
3. 选择“编辑小组件”；
4. 在“参数”中粘贴邮箱。

普通用户直接填写邮箱即可。旧版 JSON、profileId 和账号显示名参数仅用于向后兼容。

## 小组件显示

### 额度概览

同时展示两个额度窗口，可选择：

- 5 小时 + 每周（默认）
- 每周 + Fable 每周

Small 和 Medium 均显示套餐标签、已用/剩余百分比、进度条、更新时间及重置时间。

### 额度详情

聚焦展示一个额度窗口，可选择：

- 5 小时额度
- 每周额度
- Fable 每周额度

Small 显示已用和剩余百分比及两项时间信息；Medium 使用大百分比突出当前额度。

如果账号没有所选额度，组件会回退到当前响应中的其他可用额度。无论设置为“已用”还是“剩余”，进度条始终表示已使用比例。

## 小组件设置

### 组件布局

- 额度概览
- 额度详情

### 概览内容

- 5 小时 + 每周
- 每周 + Fable 每周

### 显示额度

- 5 小时额度
- 每周额度
- Fable 每周额度

### 用量显示

- 已用
- 剩余

### 刷新频率

- 5 分钟
- 10 分钟
- 15 分钟
- 30 分钟（默认）
- 60 分钟

iOS WidgetKit 可能根据系统调度策略延后刷新；所选时间是请求的最早刷新时间，不是严格定时器。脚本同时限制用量接口的最短实时请求间隔，以降低 HTTP 429 风险。

## 数据来源

- OAuth Authorize：`https://claude.ai/oauth/authorize`
- OAuth Token：`https://console.anthropic.com/v1/oauth/token`
- 用量：`https://api.anthropic.com/api/oauth/usage`
- OAuth Beta：`oauth-2025-04-20`

用量接口当前可返回 5 小时和每周额度。Fable 独立周限已由 Anthropic 官方说明及 Claude Code `/usage` 界面确认；由于公开 OAuth 响应样本可能滞后，项目兼容 `seven_day_fable`、`seven_day_fable_5` 和 `fable_seven_day` 三种字段名称。

这些 OAuth 和用量路径来自 Claude Code 当前实现，并非面向第三方承诺长期稳定的公共 API。Anthropic 更新后，端点、字段或访问策略可能变化。

## 隐私与安全

- OAuth Token 仅保存在当前设备的 Scripting Keychain；
- 账号注册表、小组件设置和用量缓存仅保存在本机 Scripting Storage；
- 项目不通过作者服务器转发登录或用量数据；
- 项目源代码和正常导出的安装包不包含账号、邮箱、Token 或用量缓存；
- 删除账号时会同时删除该账号的本机凭证和用量缓存；
- 不要分享授权码、Token、Keychain 导出或完整 App 容器备份；
- Claude Usage 使用独立的 `claude_*` 本地命名空间，不会读取或覆盖其他组件数据。

## 已知限制

- Claude Code OAuth 和内部用量接口可能随时变化；
- Free 个人账号不能完成 Claude Code 订阅登录；
- Fable 独立周限并非所有套餐或账号都会返回；
- Fable OAuth 字段名称仍需通过最新付费账号响应最终确认；
- 用量接口可能返回 HTTP 429，此时组件会优先展示缓存；
- 套餐字段并非所有响应都会提供，缺失时显示 `Claude`；
- WidgetKit 不保证严格按照所选分钟数刷新；
- Small 和 Medium 以外的组件尺寸未专门适配。

## 项目结构

```text
Claude Usage/
├── assets/
│   └── watermark-claude.png        透明 Claude 水印
├── components/
│   └── UsageWidgetView.tsx         Small / Medium、概览 / 详情布局
├── services/
│   ├── accounts.ts                 多账号注册表与 Keychain 凭证
│   ├── api.ts                      用量请求、解析、缓存与限流处理
│   ├── credentials.ts              小组件设置
│   ├── format.ts                   时间和百分比格式化
│   ├── oauth.ts                    Anthropic OAuth、PKCE 与 Token 刷新
│   └── types.ts                    类型定义
├── app_intents.tsx                 手动刷新意图
├── index.tsx                       账号、授权、用量与设置页
├── widget.tsx                      小组件入口
├── script.json                     Scripting 项目元数据
└── LICENSE                         MIT License
```

## 免责声明

本项目仅用于查看本人账号的 Claude Code 用量信息。请自行评估内部接口变更、账号策略和第三方脚本带来的风险，并遵守 Anthropic 服务条款。项目不保证接口永久可用，也不对用量数据延迟、解析差异、限流或服务端策略变化承担责任。
