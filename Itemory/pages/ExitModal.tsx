import { buildExitMutationPayload, isUnknownMutationError, newMutationContext, type MutationContext } from "../services/mutation";
import { createSubmissionGuard } from "../services/submission-guard";
import {
  Button,
  DatePicker,
  HStack,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Section,
  Text,
  TextField,
  useState,
  useRef,
} from "scripting";
import type { ExitReason, ItemExitRecord, ItemRecord } from "../models/types";
import { EXIT_REASON_LABELS } from "../models/types";
import { minorToDecimalText, parseYuanToMinor, formatMinorMoney, todayYmd, tsToYmd, ymdToTs } from "../services/format";
import { exitItem, undoExit } from "../services/commands";
import {
  NativeActionRow,
  NativeNoteRow,
  NativeSectionHeader,
  nativeListPageProps,
} from "../ui/native-list";


const REASONS: ExitReason[] = ["sold", "gifted", "discarded", "lost"];

export function ExitModal(props: {
  itemId: string;
  expectedRevision: number;
  exitRecord?: ItemExitRecord | null;
  onSuccess?: () => void;
  item?: ItemRecord | null;
}) {
  const { itemId, expectedRevision, exitRecord, onSuccess, item } = props;
  const isEditing = !!exitRecord;
  const dismiss = Navigation.useDismiss();

  const [reason, setReason] = useState<ExitReason>(exitRecord?.reason ?? "sold");
  const [exitDate, setExitDate] = useState(exitRecord?.exitedOn ?? todayYmd());
  const [amountText, setAmountText] = useState(
    exitRecord?.recoveryAmountMinor !== null && exitRecord?.recoveryAmountMinor !== undefined
      ? minorToDecimalText(exitRecord.recoveryAmountMinor)
      : ""
  );
  const [noteText, setNoteText] = useState(exitRecord?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const submission = useRef(createSubmissionGuard());
  const mutation = useRef<MutationContext | null>(null);
  const restoreSubmission = useRef(createSubmissionGuard());
  const restoreMutation = useRef<MutationContext | null>(null);

  async function handleConfirm() {
    let saleAmountMinor: number | null = null;
    try {
      if (reason === "sold") saleAmountMinor = parseYuanToMinor(amountText);
    } catch (error) {
      await Dialog.alert({
        title: "无法结束持有",
        message: error instanceof Error ? error.message : String(error),
        buttonLabel: "好",
      });
      return;
    }
    if (reason === "sold" && saleAmountMinor !== null && saleAmountMinor < 0) {
      // parseYuanToMinor never returns a negative value today; keep the guard so
      // a future parser change cannot submit a negative recovery amount.
      await Dialog.alert({
        title: "无法结束持有",
        message: "回收金额不能为负数。",
        buttonLabel: "好",
      });
      return;
    }
    if (!isEditing) {
      const resultLabel = EXIT_REASON_LABELS[reason];
      // Empty means "unknown", which the domain layer already stores as null.
      // Never present it as ¥0 or as a bare currency sign.
      const recoveryText =
        reason !== "sold"
          ? ""
          : saleAmountMinor === null
            ? "回收金额留空，将按「未知」保存；累计收入与净成本会标记为不完整。"
            : `出售回收金额为 ¥${minorToDecimalText(saleAmountMinor)}，将计入累计收入并重新计算净成本。`;
      const confirmed = await Dialog.confirm({
        title: `确认${resultLabel}并结束持有？`,
        message: `结束日期为 ${exitDate}。结束后将停止累计持有天数，历史记录仍会保留。${recoveryText}`,
        confirmLabel: "结束持有",
        cancelLabel: "取消",
      });
      if (!confirmed) return;
    }
    if (!submission.current.begin()) return;
    setBusy(true);
    try {
      const commandPayload = buildExitMutationPayload({
        itemId,
        reason,
        exitedOn: exitDate,
        recoveryAmountMinor: saleAmountMinor,
        note: noteText,
        expectedRevision,
      });
      if (!mutation.current) mutation.current = newMutationContext("item.exit", commandPayload);
      await exitItem({
        itemId,
        reason,
        exitedOn: exitDate,
        recoveryAmountMinor: saleAmountMinor,
        note: noteText.trim() || null,
        expectedRevision,
        command: mutation.current,
      });
      submission.current.complete();
      if (onSuccess) await Promise.resolve(onSuccess());
      dismiss();
    } catch (err) {
      const unknown = isUnknownMutationError(err);
      if (unknown) {
        setUnknownOutcome(true);
        await Dialog.alert({
          title: "保存结果未知",
          message: "请重启并核对待决操作，当前不要重复保存。",
          buttonLabel: "知道了",
        });
      } else {
        if (!submission.current.isCompleted()) mutation.current = null;
        await Dialog.alert({
          title: submission.current.isCompleted() ? "已保存" : "无法结束持有",
          message: submission.current.isCompleted()
            ? "刷新或关闭页面失败，请返回详情，勿重复提交。"
            : err instanceof Error
            ? err.message
            : String(err),
          buttonLabel: "好",
        });
        submission.current.release();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreHolding() {
    if (!item || !exitRecord || busy || unknownOutcome) return;
    const recoveryText = exitRecord.recoveryAmountMinor
      ? `已记录的出售回收款（${formatMinorMoney(exitRecord.recoveryAmountMinor)}）将同步撤销。`
      : "";
    const labels = { in_use: "在用", idle: "闲置", damaged: "损坏" } as const;
    const confirmed = await Dialog.confirm({
      title: "恢复持有",
      message: `恢复后，物品状态将回到「${labels[item.holdingCondition]}」。${recoveryText}`,
      confirmLabel: "恢复持有",
      cancelLabel: "取消",
    });
    if (!confirmed || !restoreSubmission.current.begin()) return;

    setBusy(true);
    try {
      const payload = buildExitMutationPayload({ itemId, expectedRevision });
      if (!restoreMutation.current) {
        restoreMutation.current = newMutationContext("item.undoExit", payload);
      }
      await undoExit({
        itemId,
        expectedRevision,
        command: restoreMutation.current,
      });
      restoreSubmission.current.complete();
      if (onSuccess) await Promise.resolve(onSuccess());
      dismiss();
    } catch (error) {
      if (restoreSubmission.current.isCompleted()) {
        await Dialog.alert({
          title: "已恢复持有",
          message: "恢复操作已经提交，但刷新或关闭页面失败。请重新打开详情，不要重复操作。",
          buttonLabel: "知道了",
        });
        return;
      }
      const unknown = isUnknownMutationError(error);
      if (unknown) {
        setUnknownOutcome(true);
        await Dialog.alert({
          title: "恢复结果未知",
          message: "请重启并核对待决操作，当前不要重复恢复持有。",
          buttonLabel: "知道了",
        });
      } else {
        restoreMutation.current = null;
        restoreSubmission.current.release();
        await Dialog.alert({
          title: "无法恢复持有",
          message: error instanceof Error ? error.message : String(error),
          buttonLabel: "好",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={isEditing ? "修改结束持有记录" : "结束持有"}
        {...nativeListPageProps("inline")}
        disabled={busy || unknownOutcome}
        toolbar={{
          cancellationAction: (
            <Button title="取消" disabled={busy || unknownOutcome} action={() => dismiss()} />
          ),
          confirmationAction: (
            <Button
              title={unknownOutcome ? "待核对" : busy ? "处理中" : isEditing ? "保存" : "确认"}
              disabled={busy || unknownOutcome || submission.current.isCompleted()}
              role={isEditing ? undefined : "destructive"}
              action={() => void handleConfirm()}
            />
          ),
        }}
      >
        <Section
          header={<NativeSectionHeader title="结束持有记录" />}
          footer={
            <NativeNoteRow
              text={
                reason === "sold"
                  ? "结束日期决定持有时间；回收金额计入累计收入并参与净成本计算。金额未知可留空，留空不会被记为 0。"
                  : "结束日期决定持有时间；历史记录和统计仍会保留。"
              }
            />
          }
        >
            <Picker
              title="结束方式"
              value={reason}
              onChanged={(v: string) => {
                setReason(v as ExitReason);
                if (v !== "sold") setAmountText("");
              }}
              pickerStyle="menu"
            >
              {REASONS.map((r) => (
                <Text key={r} tag={r}>
                  {EXIT_REASON_LABELS[r]}
                </Text>
              ))}
            </Picker>
            <DatePicker
              title="结束日期"
              value={ymdToTs(exitDate)}
              displayedComponents={["date"]}
              onChanged={(ts) => setExitDate(tsToYmd(ts))}
            />
            {reason === "sold" ? (
              <>
                <HStack
                  spacing={12}
                  alignment="center"
                >
                  <Text>回收金额</Text>
                  <TextField
                    title=" "
                    prompt="留空表示未知"
                    value={amountText}
                    onChanged={setAmountText}
                    keyboardType="decimalPad"
                    multilineTextAlignment="trailing"
                    frame={{ maxWidth: "infinity" }}
                  />
                </HStack>
              </>
            ) : null}
            <HStack
              spacing={12}
              alignment="center"
            >
              <Text>备注</Text>
              <TextField
                title=" "
                prompt="转让对象或处置说明（选填）"
                value={noteText}
                onChanged={setNoteText}
                multilineTextAlignment="trailing"
                frame={{ maxWidth: "infinity" }}
              />
            </HStack>

        </Section>

        {isEditing && exitRecord && item ? (
          <Section>
            <NativeActionRow
              title="恢复持有"
              systemImage="arrow.uturn.backward"
              disabled={busy || unknownOutcome}
              action={() => void handleRestoreHolding()}
            />
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  );
}
