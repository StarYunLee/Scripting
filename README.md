# Scripting

适用于 [Scripting App](https://scriptingapp.github.io/) 的非官方开源小组件与脚本项目。

## 安装方式

两种入口指向同一个 `.scripting` 安装包：

- **直接安装**：点击项目下的安装链接，下载当前包并用 Scripting 打开。适合第一次安装。
- **远程导入**：复制项目下的远程地址，在 Scripting 中选择「导入远程脚本」并粘贴导入。

直接安装只拿到当时那一份，之后更新仓库不会自动同步。远程导入由 Scripting 记住该地址；只有安装包启用了自动更新，才会定期检查新版本。目前 AI Usage、GitHub Stars 与 Icon Library 会每日检查，其余项目仍需重新导入。

## 目录

- [AI Usage](#ai-usage)
- [GitHub Stars](#github-stars)
- [Icon Library](#icon-library)
- [Surge Metrics](#surge-metrics)

## AI Usage

面向 Scripting App 的非官方多平台 AI 用量聚合与桌面看板工具。在一个应用中集中管理主流平台的多账号用量、主屏幕小组件与本地数据安全。

当前版本：`1.7.1`

- **多平台与多账号聚合**：统一连接 Codex、Grok、Claude、Antigravity、Cursor、Kimi Code、GitHub Copilot、Z.ai 与 MiniMax，支持同平台多账号及多额度窗口独立跟踪。
- **全尺寸桌面看板**：提供单账号 Small / Medium 小组件，以及可展示 2、4 或 8 个账号的 Small / Medium / Large 多账号看板；可配置展示账号、额度窗口与账号标识。
- **双重视觉风格**：默认彩色风格提供品牌徽章与绿 / 橙 / 红额度预警；Clear 简约风格在普通桌面呈现黑白线框，在透明桌面呈现通透白线框。
- **透明小组件适配**：采用 15% 微透暗底、纯白高对比文字、苹果亮绿用量色与抗杂色微阴影（受静态壁纸切片且无实时模糊限制，不保证所有高反差、强光或复杂壁纸下效果均佳）。
- **文件级加密备份与恢复**：使用 PBKDF2-HMAC-SHA256 与 AES-256-GCM 保护账号凭据、默认选择和小组件偏好，支持跨设备迁移与增量恢复。
- **可靠缓存与本地隐私**：网络异常或接口限流时回退最近成功缓存；凭据保存在本机 Keychain，并提供无需真实账号的只读演示模式。

<table>
  <tr>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-app-light.jpeg" alt="AI Usage 浅色应用预览" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-widgets-light.jpeg" alt="AI Usage 浅色 Small 与 Medium 小组件" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-layouts-light.jpeg" alt="AI Usage 浅色 Medium 布局" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-dashboard-light.jpeg" alt="AI Usage 浅色多账号小组件" /></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-app-dark.jpeg" alt="AI Usage 深色应用预览" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-widgets-dark.jpeg" alt="AI Usage 深色 Small 与 Medium 小组件" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-layouts-dark.jpeg" alt="AI Usage 深色 Medium 布局" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-dashboard-dark.jpeg" alt="AI Usage 深色多账号小组件" /></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-clear-standard.jpeg" alt="AI Usage 普通桌面 Clear 简约小组件" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-clear-transparent.jpeg" alt="AI Usage 透明桌面 Clear 简约小组件" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-transparent-widgets.jpeg" alt="AI Usage 透明单账号小组件" /></td>
    <td align="center" width="25%"><img src="./AI%20Usage/assets/ai-usage-preview-transparent-dashboard.jpeg" alt="AI Usage 透明多账号看板小组件" /></td>
  </tr>
</table>

- [查看源码与使用说明](./AI%20Usage/)
- [直接安装 AI-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/AI-Usage.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/AI-Usage.scripting
```


## GitHub Stars

面向 Scripting App 的非官方 GitHub Stars 与仓库管理工具。在一个应用中浏览和维护 Stars、自定义列表、本人仓库与 GitHub 个人资料。

当前版本：`1.1.1`

- **Stars 与自定义列表**：按 Star 时间浏览和搜索仓库，支持按语言、自定义列表、Star 时间、最近推送、星标数或名称筛选排序；可创建、重命名、删除列表并批量维护仓库归属。
- **仓库资料管理**：浏览本人公开或私有仓库，支持描述、Homepage、Topics 与 Issues 状态维护；GitHub Pinned 仓库优先展示。
- **Fork 协作检查**：查看 Fork 上游状态，支持重新检查、同步上游与查看差异；检测到冲突时不会强制覆盖，并要求输入仓库名称确认归档。
- **个人资料与洞察**：展示 Stars、Lists、Followers、Following、贡献热力图与常用语言信息。
- **本地缓存与权限管理**：访问令牌保存在本机 Keychain，支持离线浏览与下拉刷新；账户、私有仓库范围和令牌操作集中在设置页。

<table>
  <tr>
    <td align="center" width="25%"><img src="./GitHub%20Stars/assets/github-stars-preview-stars.jpeg" alt="GitHub Stars 收藏仓库页预览" /></td>
    <td align="center" width="25%"><img src="./GitHub%20Stars/assets/github-stars-preview-lists.jpeg" alt="GitHub Stars 列表页预览" /></td>
    <td align="center" width="25%"><img src="./GitHub%20Stars/assets/github-stars-preview-repositories.jpeg" alt="GitHub Stars 仓库页预览" /></td>
    <td align="center" width="25%"><img src="./GitHub%20Stars/assets/github-stars-preview-settings.jpeg" alt="GitHub Stars 设置页预览" /></td>
  </tr>
</table>

- [查看源码与使用说明](./GitHub%20Stars/)
- [直接安装 GitHub-Stars.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/GitHub-Stars.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/GitHub-Stars.scripting
```

## Icon Library

面向 Scripting App 的非官方 GitHub 公开图标库管理工具。集中管理自有图标库、订阅公开索引，并将图标导入、提交与导出整合在一个应用中。

当前版本：`1.1.2`

- **多图标库管理**：连接或创建多个 GitHub 公开图标库，按仓库独立保存访问令牌与显示名称。
- **图标导入与整理**：从相册、文件、Lobe Icons 与 App Store 导入图标，支持搜索、重命名和批量删除；App Store 图标支持多尺寸与官方圆角或原图样式。
- **可靠仓库写入**：上传或批量删除合并为单次提交，同名文件可选择覆盖或跳过；新建图标库时可按需写入自动生成索引的 GitHub Actions 工作流。
- **订阅与导出**：只读浏览其他公开 `icons.json` 索引，支持复制引用和将图标、订阅、Lobe 或 App Store 图片导出为 PNG。
- **本地授权与隐私**：访问令牌保存在本机 Keychain，仓库配置、订阅列表和缓存保存在本机 Storage，不经过作者服务器中转。

<table>
  <tr>
    <td align="center" width="25%"><img src="./Icon%20Library/assets/icon-library-preview-icons.jpeg" alt="Icon Library 图标页预览" /></td>
    <td align="center" width="25%"><img src="./Icon%20Library/assets/icon-library-preview-subscriptions.jpeg" alt="Icon Library 订阅页预览" /></td>
    <td align="center" width="25%"><img src="./Icon%20Library/assets/icon-library-preview-upload.jpeg" alt="Icon Library 上传页预览" /></td>
    <td align="center" width="25%"><img src="./Icon%20Library/assets/icon-library-preview-settings.jpeg" alt="Icon Library 设置页预览" /></td>
  </tr>
</table>

- [查看源码与使用说明](./Icon%20Library/)
- [直接安装 Icon-Library.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Icon-Library.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Icon-Library.scripting
```

## Surge Metrics

面向 Scripting App 的非官方 Surge iOS 运行指标小组件。通过 Surge HTTP API 的 Prometheus Metrics 端点读取引擎状态、累计流量与接口流量，并在主屏幕提供 Medium / Large 看板。

当前版本：`1.1.0`

- **核心运行指标**：展示累计上行与下行、内存占用、活跃请求、DNS 缓存、运行时长、Surge 版本 / Build 以及未授权访问封禁告警。
- **Medium / Large 看板**：Medium 聚焦累计流量与核心状态；Large 进一步展示累计流量最高的 3 个接口及其上下行构成。
- **刷新与预览**：支持 5 / 10 / 15 / 30 / 60 分钟的最早刷新请求、组件内手动刷新，以及设置页双尺寸预览和实际更新时间显示。
- **连接配置**：支持 Host、Port、HTTP API Key 与 HTTPS 配置，并提供连通测试、缓存清理和“立即刷新并预览”。
- **本地数据边界**：组件直连用户配置的 Surge HTTP API，不经过作者服务器；配置与缓存保存在本机 Storage。

![Surge Metrics 小组件预览](./Surge%20Metrics/assets/surge-metrics-preview.png)

- [查看源码与使用说明](./Surge%20Metrics/)
- [直接安装 Surge-Metrics.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Surge-Metrics.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Surge-Metrics.scripting
```

## 隐私

- Token、API Key 仅保存在当前设备的 Scripting Keychain 或 Storage；
- 账号、连接配置、设置和用量 / 指标缓存仅保存在本机 Scripting Storage；
- 项目不通过作者服务器转发登录、用量或指标数据；
- 仓库源码和安装包不包含作者的账号、Token、API Key 或运行时缓存。

## 开源许可

仓库采用 [MIT License](./LICENSE)。各独立 `.scripting` 安装包内也携带对应许可证。

## 作者与反馈

- 作者与维护者：[StarYunLee](https://github.com/StarYunLee)
- 问题反馈：[GitHub Issues](https://github.com/StarYunLee/Scripting/issues)

提交 Issue 时，请在标题中用方括号注明项目名称，例如 `[AI Usage]`。

## 友链

- [LINUX DO](https://linux.do/) — 社区讨论与反馈
- [烧饼论坛](https://sb.sb/)

## 免责声明

本仓库项目不是 GitHub、Surge、OpenAI、Anthropic、xAI、Google 或 Scripting App 官方产品。相关 HTTP API、OAuth、用量及 Billing 接口可能随服务端更新而变化。使用者应遵守对应软件许可与平台服务条款并自行承担使用风险。
