# Scripting

适用于 [Scripting App](https://scriptingapp.github.io/) 的非官方开源小组件与脚本项目。

## 安装方式

两种入口指向同一个 `.scripting` 安装包：

- **直接安装**：点击项目下的安装链接，下载当前包并用 Scripting 打开。适合第一次安装。
- **远程导入**：复制项目下的远程地址，在 Scripting 中选择「导入远程脚本」并粘贴导入。

直接安装只拿到当时那一份，之后更新仓库不会自动同步。远程导入由 Scripting 记住该地址；只有安装包启用了自动更新，才会定期检查新版本。目前仅 AI Usage 会每日检查，其余项目仍需重新导入。

## 目录

- [AI Usage](#ai-usage)
- [Surge Metrics](#surge-metrics)
- [Codex Usage](#codex-usage)（不再更新，请用 [AI Usage](#ai-usage)）
- [Claude Usage](#claude-usage)（不再更新，请用 [AI Usage](#ai-usage)）
- [Grok Usage](#grok-usage)（不再更新，请用 [AI Usage](#ai-usage)）

## 项目

### AI Usage

统一查看 Codex、Grok、Claude、Antigravity 与 Cursor 多账号用量的应用，支持 Small / Medium 主屏幕小组件、按账号布局、固定剩余额度显示，以及快捷指令 / App Intent 刷新。

<table>
  <tr>
    <td align="center" width="33%"><img src="./AI%20Usage/assets/ai-usage-preview-small.jpeg" alt="AI Usage Small 小组件预览" /></td>
    <td align="center" width="33%"><img src="./AI%20Usage/assets/ai-usage-preview-medium.jpeg" alt="AI Usage Medium 小组件预览" /></td>
    <td align="center" width="33%"><img src="./AI%20Usage/assets/ai-usage-preview-app.jpeg" alt="AI Usage 应用预览" /></td>
  </tr>
</table>

- [查看源码与使用说明](./AI%20Usage/)
- [直接安装 AI-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/AI-Usage.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/AI-Usage.scripting
```

> Codex Usage、Claude Usage、Grok Usage 不再更新，请改用 AI Usage。旧项目仍可安装，仅作兼容保留。

### Surge Metrics

Surge iOS 运行指标小组件，通过官方 Prometheus Metrics 端点展示累计上下行、内存占用、活跃请求、DNS 缓存、运行时长及网络接口累计流量 Top 3；支持 Medium、Large、明暗模式、WidgetKit 请求刷新及手动刷新。

![Surge Metrics 小组件预览](./Surge%20Metrics/assets/surge-metrics-preview.png)

- [查看源码与使用说明](./Surge%20Metrics/)
- [直接安装 Surge-Metrics.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Surge-Metrics.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Surge-Metrics.scripting
```

### Codex Usage

OpenAI Codex 用量小组件，支持 OpenAI OAuth、多账号、账号级显示设置、额度窗口、用量限额重置权益及最近到期时间，以及双额度概览和单额度详情布局。

![Codex Usage 小组件预览](./Codex%20Usage/assets/codex-usage-preview.png)

- [查看源码与使用说明](./Codex%20Usage/)
- [直接安装 Codex-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Codex-Usage.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Codex-Usage.scripting
```

### Claude Usage

Claude Code 用量小组件，支持 Anthropic OAuth、多账号、账号级显示设置、5 小时/周限/Fable 周限、双额度概览和单额度详情布局，以及可复制的脱敏诊断报告（便于反馈 429 / 空窗）。

![Claude Usage 小组件预览](./Claude%20Usage/assets/claude-usage-preview.png)

- [查看源码与使用说明](./Claude%20Usage/)
- [直接安装 Claude-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Claude-Usage.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Claude-Usage.scripting
```

### Grok Usage

Grok Build 额度小组件，支持 xAI OAuth、多账号、账号级显示设置、统一每周额度、用量限额重置权益，以及 Small、Medium 两种尺寸。

![Grok Usage 小组件预览](./Grok%20Usage/assets/grok-usage-preview.png)

- [查看源码与使用说明](./Grok%20Usage/)
- [直接安装 Grok-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Grok-Usage.scripting)

远程导入地址：

```text
https://raw.githubusercontent.com/StarYunLee/Scripting/main/Grok-Usage.scripting
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

提交 Issue 时，请在标题中注明 `[AI Usage]`、`[Surge Metrics]`、`[Codex Usage]`、`[Claude Usage]` 或 `[Grok Usage]`。

## 友链
- [LINUX DO](https://linux.do/) — 社区讨论与反馈
- [烧饼论坛](https://sb.sb/)

## 免责声明

本仓库项目不是 Surge、OpenAI、Anthropic、xAI、Google 或 Scripting App 官方产品。相关 HTTP API、OAuth、用量及 Billing 接口可能随服务端更新而变化。使用者应遵守对应软件许可与平台服务条款并自行承担使用风险。
