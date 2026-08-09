# Grok Usage

面向 [Scripting App](https://scriptingapp.github.io/) 的非官方 Grok Build 订阅额度小组件。支持 xAI OAuth、多账号、每周与月度双额度窗口，以及 Small、Medium 两种尺寸。

> 本项目不是 xAI 或 Grok 官方产品，与 xAI 无隶属或合作关系。

## 功能

- xAI Authorization Code OAuth + PKCE
- Access Token、Refresh Token 和 ID Token 保存在本机 Keychain
- Token 到期前自动刷新
- 多账号管理，每个账号独立保存凭证和额度缓存
- 同时读取并显示每周额度和月度 Credits
- Small、Medium 均采用周/月双窗口布局
- 支持显示已用或剩余百分比
- 展示每个额度窗口的进度条和重置时间
- Medium 额外展示月度 Credits 已用值与总额
- SuperGrok / SuperGrok Heavy 套餐徽章
- 网络失败时回退到本机最近一次成功缓存
- 支持 AppIntent 手动刷新

## 系统要求

- iPhone 或 iPad
- 已安装 Scripting App
- 可使用 Grok Build 订阅额度的 xAI / SuperGrok 账号
- 需要联网完成 OAuth 和额度查询
- 不需要 Scripting Pro

## 安装

### 直接安装

下载并使用 Scripting 打开：[Grok-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Grok-Usage.scripting)

### 远程导入

在 Scripting 中选择“远程导入”，复制并粘贴：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Grok-Usage.scripting
```

### 从源码导入

1. 下载本项目源码目录或 `.scripting` 安装包。
2. 将 `Grok Usage` 导入 Scripting App。
3. 在 Scripting 中运行 `Grok Usage`，进入账号和小组件设置页。
4. 按下方步骤完成 xAI OAuth。
5. 在主屏幕添加 Scripting 小组件，并选择 `Grok Usage`。

## OAuth 登录

Grok Usage 使用 xAI 公共 OAuth Client 的 Authorization Code + PKCE：

- Authorize：`https://auth.x.ai/oauth2/authorize`
- Token：`https://auth.x.ai/oauth2/token`
- 固定回调：`http://127.0.0.1:56122/callback`
- Scope：`openid profile email offline_access grok-cli:access api:access`

登录步骤：

1. 在设置页点击“添加 Grok 账号”或当前账号下的“授权此账号”。
2. 系统浏览器会打开 xAI 登录和授权页面。
3. 完成授权后，浏览器会跳转到：

   ```text
   http://127.0.0.1:56122/callback?code=...&state=...
   ```

4. 页面显示无法连接属于正常现象；复制 Safari 地址栏中的完整回调地址。
5. 返回 Grok Usage，将地址粘贴到“回调地址或授权码”。
6. 如果 xAI 页面直接显示一次性 Authorization Code，也可以只粘贴该代码。
7. 点击“提交回调并完成授权”。
8. 授权成功后，脚本会读取账号身份并刷新 Grok Build 额度。

OAuth 临时状态有效期为 10 分钟。Authorization Code 通常只能交换一次；授权失败或超时后请重新开始。

> 回调 URL 和一次性代码都属于短期敏感凭据。不要截图、公开或发送给他人。

## 多账号与小组件参数

Grok Usage 支持同时添加多个账号：

- 每个账号拥有独立的 Keychain 凭证和额度缓存；
- 可以设置一个默认账号；
- 小组件参数为空时显示默认账号；
- 每个主屏幕小组件可以绑定不同账号。

绑定账号的方法：

1. 在 Grok Usage 的“主屏幕多账号小组件”中复制目标邮箱；
2. 长按主屏幕小组件；
3. 选择“编辑小组件”；
4. 在“参数”中粘贴邮箱。

普通用户直接填写邮箱即可。旧版 JSON、profileId 和账号显示名参数仅用于向后兼容。

## 额度与显示逻辑

Grok Build 当前返回两套额度数据：

### 每周额度

来自周周期 Billing 数据，包含：

- 已用百分比；
- 剩余百分比；
- 周期结束/重置时间。

### 每月额度

来自月度 Credits 数据，包含：

- 已用 Credits；
- 月度 Credits 总额；
- 已用和剩余百分比；
- 月度周期结束/重置时间。

两个窗口属于同一 Grok Build 订阅额度体系下的不同周期限制，因此 Small 和 Medium 都会同时展示，不提供“主额度窗口”切换。

### Small

- 套餐徽章与更新时间；
- 每周额度标题、已用/剩余百分比、进度条和重置时间；
- 每月额度标题、已用/剩余百分比、进度条和重置时间。

### Medium

- 套餐徽章与更新时间；
- 每周额度、百分比、进度条和重置时间；
- 每月额度、Credits 已用/总额、百分比、进度条和重置时间；
- Grok 背景水印。

无论“用量显示”选择已用还是剩余，进度条始终表示已使用比例。

## 小组件设置

### 用量显示

- 已用
- 剩余

### 刷新频率

- 5 分钟
- 10 分钟
- 15 分钟
- 30 分钟（默认）
- 60 分钟

iOS WidgetKit 可能根据系统调度策略延后刷新，所选时间是请求的最早刷新时间，不是严格定时器。

## 数据来源

- OAuth Discovery：`https://auth.x.ai/.well-known/openid-configuration`
- OAuth Authorize：`https://auth.x.ai/oauth2/authorize`
- OAuth Token：`https://auth.x.ai/oauth2/token`
- 月度额度：`https://cli-chat-proxy.grok.com/v1/billing`
- 每周额度：`https://cli-chat-proxy.grok.com/v1/billing?format=credits`
- CLI 请求标识：`x-xai-token-auth: xai-grok-cli`

OAuth 使用 xAI 认证端点；Billing 数据来自 Grok Build / CLI 当前使用的订阅额度接口，并非面向第三方承诺长期稳定的公开 API。xAI 更新后，路径、字段或访问策略可能变化。

## 套餐标签

Billing 接口当前不直接返回统一的标准套餐名称。本项目参考 Grok CLI 社区实现，根据月度额度推断显示：

- SuperGrok
- SuperGrok Heavy

当前分层规则为：月度额度大于 `20,000` 时显示 SuperGrok Heavy，否则显示 SuperGrok。项目按当前设计不单独显示 Lite / Free 标签。

套餐标签是基于额度字段的推断，仅供界面展示，不应视为 xAI 官方账户套餐判定。

## 隐私与安全

- OAuth Token 仅保存在当前设备的 Scripting Keychain；
- 账号注册表、小组件设置和额度缓存仅保存在本机 Scripting Storage；
- 项目不通过作者服务器转发登录或额度数据；
- 项目源代码和正常导出的安装包不包含你的账号、邮箱、Token 或额度缓存；
- 删除账号时会同时删除该账号的本机凭证和额度缓存；
- 不要分享 OAuth 回调 URL、一次性代码、Token、Keychain 导出或完整 App 容器备份；
- Grok Usage 使用独立的 `grok_*` 本地命名空间，不会读取或覆盖 Codex Usage 数据。

## 已知限制

- Grok Build / CLI Billing 接口可能随时变化；
- OAuth 成功不代表所有账号都具有 Grok Build 订阅额度访问权限；
- 套餐名称属于推断结果；
- WidgetKit 不保证严格按照所选分钟数刷新；
- Small 和 Medium 以外的组件尺寸未专门适配。

## 项目结构

```text
Grok Usage/
├── assets/                         Grok 水印资源
├── components/
│   └── UsageWidgetView.tsx         Small / Medium 周月双窗口布局
├── services/
│   ├── accounts.ts                 多账号注册表与 Keychain 凭证
│   ├── api.ts                      Grok Billing、额度解析与缓存
│   ├── credentials.ts              小组件设置与布局默认值
│   ├── format.ts                   时间和百分比格式化
│   ├── oauth.ts                    xAI OAuth、PKCE 与 Token 刷新
│   └── types.ts                    类型定义
├── app_intents.tsx                 手动刷新意图
├── index.tsx                       账号、授权、额度与设置页
├── widget.tsx                      小组件入口
├── script.json                     Scripting 项目元数据
├── LICENSE                         MIT 许可证
└── README.md
```

## 作者与维护

- 作者与维护者：[StarYunLee](https://github.com/StarYunLee)
- 问题反馈：[GitHub Issues](https://github.com/StarYunLee/Scripting/issues)
- 提交 Issue 时，请在标题中注明 `[Grok Usage]`。

本项目采用 [MIT License](./LICENSE) 开源。

## 免责声明

本项目仅用于查看本人账号的 Grok Build 订阅额度。请自行评估内部接口变更、账号策略和第三方脚本带来的风险，并遵守 xAI 服务条款。项目不保证接口永久可用，也不对额度数据延迟、套餐推断差异或服务端策略变化承担责任。
