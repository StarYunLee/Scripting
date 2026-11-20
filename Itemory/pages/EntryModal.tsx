import { buildMoneyMutationPayload, isUnknownMutationError, newMutationContext, type MutationContext } from "../services/mutation";
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
  VStack,
  useState,
  useRef,
} from "scripting";
import type { MoneyDirection, MoneyEntryKind, TimelineDisplayItem } from "../models/types";
import { minorToDecimalText, parseYuanToMinor, todayYmd, tsToYmd, ymdToTs } from "../services/format";
import { addMoneyEntry, updateMoneyEntry } from "../services/commands";
import { nativeListPageProps } from "../ui/native-list";


type EntryKindChoice = MoneyEntryKind;
type RecordNature = MoneyDirection;

const ENTRY_KIND_LABELS: Record<MoneyEntryKind, string> = {
  accessory: "配件",
  maintenance: "保养",
  repair: "维修",
  upgrade: "升级",
  other: "其他",
};

const TITLE_PROMPTS: Record<EntryKindChoice | MoneyDirection, string> = {
  accessory: "例如：购买保护壳",
  maintenance: "例如：清洁保养",
  repair: "例如：更换电池",
  upgrade: "例如：升级内存",
  other: "例如：购买延保",
  expense: "例如：购买配件",
  income: "例如：配件退款",
};

const NOTE_PROMPTS: Record<EntryKindChoice | MoneyDirection, string> = {
  accessory: "型号、渠道等（选填）",
  maintenance: "保养内容、服务门店（选填）",
  repair: "故障、零件或维修渠道（选填）",
  upgrade: "升级型号或配置（选填）",
  other: "补充说明（选填）",
  expense: "补充说明（选填）",
  income: "退款、理赔或回收说明（选填）",
};

function LabeledEntryField(props: {
  title: string;
  prompt: string;
  value: string;
  onChanged: (value: string) => void;
  decimal?: boolean;
}) {
  const field = props.decimal ? (
    <TextField
      title=" "
      prompt={props.prompt}
      value={props.value}
      onChanged={props.onChanged}
      axis="horizontal"
      keyboardType="decimalPad"
      multilineTextAlignment="trailing"
      frame={{ maxWidth: "infinity" }}
    />
  ) : (
    <TextField
      title=" "
      prompt={props.prompt}
      value={props.value}
      onChanged={props.onChanged}
      axis="horizontal"
      multilineTextAlignment="trailing"
      frame={{ maxWidth: "infinity" }}
    />
  );
  return (
    <HStack
      spacing={12}
      alignment="center"
    >
      <Text>{props.title}</Text>
      {field}
    </HStack>
  );
}

export function EntryModal(props: {
  itemId: string;
  defaultNature?: RecordNature;
  defaultType?: EntryKindChoice;
  entry?: TimelineDisplayItem | null;
  expectedRevision: number;
  onSaved?: () => void;
}) {
  const { itemId, defaultNature = "expense", defaultType = "accessory", entry, expectedRevision, onSaved } = props;
  const isEditing = !!entry;
  const nature: RecordNature = entry ? (entry.direction ?? "expense") : defaultNature;
  const dismiss = Navigation.useDismiss();
  const [kind, setKind] = useState<MoneyEntryKind>(
    entry?.kind ?? (defaultType as MoneyEntryKind) ?? "other"
  );
  const [title, setTitle] = useState(entry?.title ?? "");
  const [amountText, setAmountText] = useState(
    entry?.amountMinor ? minorToDecimalText(entry.amountMinor) : ""
  );
  const [date, setDate] = useState(entry?.date ?? todayYmd());
  const [note, setNote] = useState(entry?.subtitle ?? "");
  const [busy, setBusy] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const submission = useRef(createSubmissionGuard());
  const mutation = useRef<MutationContext | null>(null);

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      await Dialog.alert({
        title: "无法保存",
        message: "请填写事项名称。",
        buttonLabel: "好",
      });
      return;
    }
    let amountMinor: number;
    try {
      amountMinor = parseYuanToMinor(amountText) ?? 0;
    } catch (error) {
      await Dialog.alert({
        title: "无法保存",
        message: error instanceof Error ? error.message : String(error),
        buttonLabel: "好",
      });
      return;
    }
    if (amountMinor <= 0) {
      await Dialog.alert({
        title: "无法保存",
        message: "请填写有效金额。",
        buttonLabel: "好",
      });
      return;
    }
    if (!submission.current.begin()) return;
    setBusy(true);
    try {
      const direction = nature as MoneyDirection;
      const payload = buildMoneyMutationPayload({
        id: entry?.id ?? null,
        itemId,
        direction,
        kind,
        amountMinor,
        occurredOn: date,
        title: trimmedTitle,
        note: note.trim() || null,
        expectedRevision,
      });
      const mutationKind = isEditing ? "money.update" : "money.add";
      if (!mutation.current) mutation.current = newMutationContext(mutationKind, payload);
      if (isEditing && entry) {
        await updateMoneyEntry({
          id: entry.id,
          itemId,
          direction,
          kind,
          amountMinor,
          occurredOn: date,
          title: trimmedTitle,
          note: note.trim() || null,
          expectedRevision,
          command: mutation.current,
        });
      } else {
        await addMoneyEntry({
          itemId,
          direction,
          kind,
          amountMinor,
          occurredOn: date,
          title: trimmedTitle,
          note: note.trim() || null,
          expectedRevision,
          command: mutation.current,
        });
      }
      submission.current.complete();
      if (onSaved) await Promise.resolve(onSaved());
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
          title: submission.current.isCompleted() ? "已保存" : "无法保存",
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

  return (
    <NavigationStack>
      <List
        navigationTitle={isEditing ? "编辑记录" : nature === "expense" ? "记录支出" : "记录收入"}
        {...nativeListPageProps("inline")}
        disabled={busy || unknownOutcome}
        toolbar={{
          cancellationAction: (
            <Button title="取消" disabled={busy || unknownOutcome} action={() => dismiss()} />
          ),
          confirmationAction: (
            <Button
              title={unknownOutcome ? "待核对" : busy ? "保存中" : "保存"}
              disabled={busy || unknownOutcome || submission.current.isCompleted()}
              action={() => void handleSave()}
            />
          ),
        }}
      >
        {/* 2. 核心大字金额输入卡 (Hero Input) */}
        <Section>
            <VStack
              spacing={4}
              alignment="leading"
              padding={{ top: 12, bottom: 12 }}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
            >
              <Text font="caption" foregroundStyle="secondaryLabel">
                {nature === "expense" ? "支出金额" : "收入金额"}
              </Text>
              <HStack spacing={6} alignment="firstTextBaseline" frame={{ maxWidth: "infinity" }}>
                <Text
                  font={28}
                  fontWeight="bold"
                  foregroundStyle={nature === "expense" ? "#FF9500" : "#34C759"}
                >
                  ¥
                </Text>
                <TextField
                  title=" "
                  prompt="0.00"
                  value={amountText}
                  onChanged={setAmountText}
                  axis="horizontal"
                  keyboardType="decimalPad"
                  font={30}
                  fontWeight="bold"
                  frame={{ maxWidth: "infinity" }}
                />
              </HStack>
            </VStack>
        </Section>

        {/* 3. 事项与详情清单 */}
        <Section>
            <LabeledEntryField
              title="事项名称"
              prompt={TITLE_PROMPTS[nature === "expense" ? kind : nature]}
              value={title}
              onChanged={setTitle}
            />
            {nature === "expense" ? (
              <>
                <Picker
                  title="支出分类"
                  value={kind}
                  onChanged={(value: string) => setKind(value as MoneyEntryKind)}
                  pickerStyle="menu"
                >
                  {(["accessory", "maintenance", "repair", "upgrade", "other"] as const).map((value) => (
                    <Text key={value} tag={value}>{ENTRY_KIND_LABELS[value]}</Text>
                  ))}
                </Picker>
              </>
            ) : null}
            <DatePicker
              title="发生日期"
              value={ymdToTs(date)}
              displayedComponents={["date"]}
              onChanged={(ts) => setDate(tsToYmd(ts))}
            />
            <LabeledEntryField
              title="备注"
              prompt={NOTE_PROMPTS[nature === "expense" ? kind : nature]}
              value={note}
              onChanged={setNote}
            />
        </Section>
      </List>
    </NavigationStack>
  );
}
