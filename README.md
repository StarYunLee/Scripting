# Scripting

适用于 [Scripting App](https://scriptingapp.github.io/) 的非官方开源小组件与脚本项目。

## 安装方式

两种入口指向同一个 `.scripting` 安装包：

- **直接安装**：点击项目下的安装链接，下载当前包并用 Scripting 打开。适合第一次安装。
- **远程导入**：复制项目下的远程地址，在 Scripting 中选择「导入远程脚本」并粘贴导入。

直接安装只拿到当时那一份，之后更新仓库不会自动同步。远程导入由 Scripting 记住该地址；只有安装包启用了自动更新，才会定期检查新版本。目前 AI Usage、GitHub Stars 与 Icon Library 会每日检查，其余项目仍需重新导入。

## 目录

### 当前维护

- [AI Usage](#ai-usage)
- [GitHub Stars](#github-stars)
- [Icon Library](#icon-library)
- [Surge Metrics](#surge-metrics)

### 已归档

- [Codex Usage](#已归档项目)
- [Claude Usage](#已归档项目)
- [Grok Usage](#已归档项目)

## 当前维护项目

### AI Usage

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

> Codex Usage、Claude Usage、Grok Usage 不再更新，请改用 AI Usage。旧项目仍可安装，仅作兼容保留。

### GitHub Stars

浏览已加星仓库，支持常驻搜索、按语言或列表筛选、多种排序，以及粘贴链接加星、长按取消 Star。可维护自定义列表与仓库归属；也可浏览本人仓库，编辑描述、Homepage、Topics 与 Issues；Fork 支持上游状态检查、同步和差异查看。设置页保留 GitHub Profile 卡片，并集中管理账户权限、私有仓库范围和访问令牌。

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

### Icon Library

用 GitHub 公开仓库托管自建图标库，按仓库独立授权，支持浏览、上传、删除和自动生成订阅索引。可从相册、文件、Lobe 品牌图标和 App Store 应用图标导入；也可订阅别人的公开图标索引，只读浏览、复制引用或导出 PNG。

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

### Surge Metrics

Surge iOS 运行指标小组件，通过官方 Prometheus Metrics 端点展示累计上下行、内存占用、活跃请求、DNS 缓存、运行时长及网络接口累计流量 Top 3；支持 Medium、Large、明暗模式、WidgetKit 请求刷新及手动刷新。

![Surge Metrics 小组件预览](./Surge%20Metrics/assets/surge-metrics-preview.png)

- [查看源码与使用说明](./Surge%20Metrics/)
- [直接安装 Surge-Metrics.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Surge-Metrics.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Surge-Metrics.scripting
```

## 已归档项目

以下项目已停止维护，相关功能已整合至 [AI Usage](#ai-usage)。为保持历史源码和安装链接可用，仓库继续保留其最终版本，但不会继续适配接口变化或修复问题；旧安装包保持最终发布版本的原始内容，不代表重新发布。

| 项目         | 最终版本 | 源码                          | 安装包                                                                                         |
| ------------ | -------: | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Codex Usage  |  `1.5.1` | [查看源码](./Codex%20Usage/)  | [下载安装](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Codex-Usage.scripting)  |
| Claude Usage |  `1.3.5` | [查看源码](./Claude%20Usage/) | [下载安装](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Claude-Usage.scripting) |
| Grok Usage   |  `1.5.1` | [查看源码](./Grok%20Usage/)   | [下载安装](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Grok-Usage.scripting)   |

> 旧项目仅为兼容和历史参考保留。新安装和问题反馈请统一使用 AI Usage。

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
