import {
  decryptBackupPayload,
  encryptBackupPayload,
  type BackupCipherEnvelope,
} from "./backup-crypto";
import { buildBackupPayload, restoreBackupPayload } from "./backup-package";
import { requestWidgetReloadAfterStorage } from "./widgets";
import { authCoordinator } from "./hub";

let backupBusy = false;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function backupFilename(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  return `ai-usage-backup-${y}${m}${d}-${h}${min}.aiusage`;
}

/**
 * 导出加密备份流程
 */
export async function runBackupExportFlow(): Promise<boolean> {
  if (backupBusy) return false;
  if (authCoordinator.findPending()) {
    await Dialog.alert({
      title: "请先结束授权",
      message: "当前正在进行账号授权，请完成或取消当前授权后再导出备份。",
      buttonLabel: "知道了",
    });
    return false;
  }
  backupBusy = true;
  try {
    const payload = buildBackupPayload();
    const accountCount = payload.data.accounts.length;

    if (accountCount === 0) {
      const proceed = await Dialog.confirm({
        title: "未检测到有效账号",
        message:
          "当前尚未添加任何已授权账号，备份将仅包含小组件偏好与应用设置。确定要继续导出吗？",
        cancelLabel: "取消",
        confirmLabel: "继续导出",
      });
      if (!proceed) return false;
    }

    // 1. 输入密码
    const password = await Dialog.prompt({
      title: "设置备份加密密码",
      message:
        "请为备份文件设置加密密码（AES-GCM 256 加密）。请妥善保管，恢复时必须输入此密码。",
      obscureText: true,
      placeholder: "输入加密密码",
      cancelLabel: "取消",
      confirmLabel: "下一步",
    });

    if (!password || password.trim().length === 0) {
      return false;
    }

    // 2. 确认密码
    const confirmPassword = await Dialog.prompt({
      title: "确认备份密码",
      message: "请再次输入刚才设置的备份密码以确保一致：",
      obscureText: true,
      placeholder: "再次输入加密密码",
      cancelLabel: "取消",
      confirmLabel: "确定导出",
    });

    if (confirmPassword == null) return false;

    if (password !== confirmPassword) {
      await Dialog.alert({
        title: "密码不匹配",
        message: "两次输入的密码不一致，导出已取消。请重新操作。",
        buttonLabel: "知道了",
      });
      return false;
    }

    // 3. 执行加密
    let envelope: BackupCipherEnvelope;
    try {
      envelope = encryptBackupPayload(payload, password);
    } catch (error) {
      await Dialog.alert({
        title: "加密失败",
        message:
          error instanceof Error ? error.message : "加密数据时发生未知错误",
        buttonLabel: "关闭",
      });
      return false;
    }

    const envelopeJson = JSON.stringify(envelope, null, 2);
    const fileData = Data.fromRawString(envelopeJson);
    if (!fileData) {
      await Dialog.alert({
        title: "文件构建失败",
        message: "无法生成备份文件二进制数据",
        buttonLabel: "关闭",
      });
      return false;
    }

    // 4. 调起系统文件保存面板
    const filename = backupFilename();
    try {
      const exported = await DocumentPicker.exportFiles({
        files: [
          {
            name: filename,
            data: fileData,
          },
        ],
      });

      if (exported && exported.length > 0) {
        await Dialog.alert({
          title: "导出成功",
          message: `备份文件已保存（包含 ${accountCount} 个账号及其配置）。请牢记加密密码。`,
          buttonLabel: "完成",
        });
        return true;
      }
    } catch (error) {
      await Dialog.alert({
        title: "导出中断",
        message: error instanceof Error ? error.message : "未完成文件保存",
        buttonLabel: "知道了",
      });
    }

    return false;
  } finally {
    backupBusy = false;
  }
}

/**
 * 从加密备份文件导入还原流程
 */
export async function runBackupImportFlow(
  onSuccess?: () => void,
): Promise<boolean> {
  if (backupBusy) return false;
  if (authCoordinator.findPending()) {
    await Dialog.alert({
      title: "请先结束授权",
      message: "当前正在进行账号授权，请完成或取消当前授权后再恢复备份。",
      buttonLabel: "知道了",
    });
    return false;
  }
  backupBusy = true;
  try {
    // 1. 选择文件
    let picked: string[];
    try {
      picked = await DocumentPicker.pickFiles();
    } catch {
      return false;
    }

    if (!picked || picked.length === 0) return false;
    const filePath = picked[0];

    // 2. 读取文件内容
    let rawContent: string;
    try {
      rawContent = await FileManager.readAsString(filePath);
    } catch {
      await Dialog.alert({
        title: "文件读取失败",
        message: "无法读取选中的备份文件，请确认权限或文件状态。",
        buttonLabel: "关闭",
      });
      return false;
    }

    // 3. 校验 Envelope Magic
    let envelope: BackupCipherEnvelope;
    try {
      envelope = JSON.parse(rawContent) as BackupCipherEnvelope;
      if (envelope.magic !== "AI_USAGE_ENCRYPTED_BACKUP") {
        throw new Error("文件不是合法的 AI Usage 加密备份格式");
      }
    } catch (error) {
      await Dialog.alert({
        title: "无效的备份文件",
        message: error instanceof Error ? error.message : "文件内容解析失败",
        buttonLabel: "关闭",
      });
      return false;
    }

    // 4. 输入密码解密
    const password = await Dialog.prompt({
      title: "输入解密密码",
      message: `正在导入备份（创建于 ${new Date(envelope.createdAt).toLocaleString()}）。请输入备份时设置的密码：`,
      obscureText: true,
      placeholder: "输入备份密码",
      cancelLabel: "取消",
      confirmLabel: "解密还原",
    });

    if (password == null) return false;

    let payload: ReturnType<typeof decryptBackupPayload>;
    try {
      payload = decryptBackupPayload(envelope, password);
    } catch (error) {
      await Dialog.alert({
        title: "解密失败",
        message: error instanceof Error ? error.message : "解密发生异常",
        buttonLabel: "关闭",
      });
      return false;
    }

    if (!payload) {
      await Dialog.alert({
        title: "密码错误或数据损坏",
        message: "密码不正确，或备份文件已被修改。认证校验未通过。",
        buttonLabel: "重试",
      });
      return false;
    }

    // 5. 确认合并
    const accountCount = payload.data.accounts?.length || 0;
    const confirmed = await Dialog.confirm({
      title: "确认恢复数据",
      message: `备份包含 ${accountCount} 个账号及相应小组件偏好。\n\n导入将采用增量合并模式，保留现有其他账号。是否确认导入？`,
      cancelLabel: "取消",
      confirmLabel: "确认合并导入",
    });

    if (!confirmed) return false;

    // 6. 执行还原
    const summary = restoreBackupPayload(payload);

    // 触发小组件与 Storage 刷新
    requestWidgetReloadAfterStorage();
    if (onSuccess) onSuccess();

    await Dialog.alert({
      title: "数据恢复成功",
      message: `已成功处理 ${summary.totalAccounts} 个账号（新增 ${summary.addedAccounts} 个，更新 ${summary.updatedAccounts} 个），偏好设置已同步应用。`,
      buttonLabel: "完成",
    });

    return true;
  } finally {
    backupBusy = false;
  }
}
