# Scripting

适用于 [Scripting App](https://scriptingapp.github.io/) 的非官方开源小组件与脚本项目。

## 项目

### Codex Usage

OpenAI Codex 用量小组件，支持多账号、5 小时/每周/每月额度窗口、Small/Medium 布局和本机 OAuth 凭证管理。

- [查看源码与使用说明](./Codex%20Usage/)
- [直接安装 Codex-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Codex-Usage.scripting)

### Grok Usage

Grok Build 订阅额度小组件，支持多账号、每周/月度双额度窗口、Small/Medium 布局和本机 xAI OAuth 凭证管理。

- [查看源码与使用说明](./Grok%20Usage/)
- [直接安装 Grok-Usage.scripting](https://raw.githubusercontent.com/StarYunLee/Scripting/main/Grok-Usage.scripting)

## 安装

点击对应的 `.scripting` 链接下载，然后选择使用 Scripting App 打开并导入。安装包内包含完整 TypeScript/TSX 源码，可在 Scripting 中查看和修改。

## 隐私

- OAuth Token 仅保存在当前设备的 Scripting Keychain；
- 账号、设置和用量缓存仅保存在本机 Scripting Storage；
- 项目不通过作者服务器转发登录或用量数据；
- 仓库源码和安装包不包含作者的账号、Token 或运行时缓存。

## 开源许可

仓库采用 [MIT License](./LICENSE)。各独立 `.scripting` 安装包内也携带对应许可证。

## 作者与反馈

- 作者与维护者：[StarYunLee](https://github.com/StarYunLee)
- 问题反馈：[GitHub Issues](https://github.com/StarYunLee/Scripting/issues)

提交 Issue 时，请在标题中注明 `[Codex Usage]` 或 `[Grok Usage]`。

## 致谢
- [LINUX DO](https://linux.do/) — 社区讨论与反馈

## 免责声明

本仓库项目不是 OpenAI、xAI 或 Scripting App 官方产品。相关 OAuth、用量及 Billing 接口可能随服务端更新而变化。使用者应遵守对应平台服务条款并自行承担使用风险。
