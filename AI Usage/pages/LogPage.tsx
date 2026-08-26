import type { ShapeStyle, VStackProps } from "scripting";
import {
  Button,
  Divider,
  HStack,
  Image,
  List,
  Section,
  Text,
  VStack,
  useState,
} from "scripting";
import { PageBackground } from "../components/PageBackground";
import { ProviderLogo } from "../components/ProviderLogo";
import {
  clearRunRecords,
  readRunRecords,
  type RunRecord,
} from "../services/logger";
import type { ProviderId } from "../models";
import type { BackgroundThemeId } from "../services/settings";

const providerName = (provider?: ProviderId) =>
  provider === "codex"
    ? "Codex"
    : provider === "grok"
      ? "Grok"
      : provider === "claude"
        ? "Claude"
        : provider === "antigravity"
          ? "Antigravity"
          : provider === "cursor"
            ? "Cursor"
            : provider === "kimi"
              ? "Kimi Code"
            : provider === "copilot"
              ? "Copilot"
              : provider === "zai"
                ? "Z.ai"
                : provider === "minimax"
                  ? "MiniMax"
                  : "系统";

function recordTime(value: string): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function fullTime(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${recordTime(value)}`;
}

function day(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function statusTitle(status: RunRecord["status"]): string {
  return status === "error"
    ? "错误"
    : status === "warning"
      ? "警告"
      : status === "cache"
        ? "缓存"
        : "成功";
}

function kindTitle(kind: RunRecord["kind"]): string {
  return kind === "auth"
    ? "授权"
    : kind === "refresh_all"
      ? "批量刷新"
      : kind === "widget"
        ? "小组件"
        : "刷新";
}

function statusColor(status: RunRecord["status"]): ShapeStyle {
  return status === "error"
    ? "systemRed"
    : status === "warning"
      ? "systemOrange"
      : status === "cache"
        ? "secondaryLabel"
        : "label";
}

function recordText(item: RunRecord): string {
  return [
    `时间：${fullTime(item.at)}`,
    `类型：${kindTitle(item.kind)}`,
    `平台：${providerName(item.provider)}`,
    item.accountLabel ? `账号：${item.accountLabel}` : null,
    `状态：${statusTitle(item.status)}`,
    `结果：${item.summary}`,
    item.detail ? `详情：${item.detail}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function showRecordDetail(item: RunRecord): Promise<void> {
  const index = await Dialog.actionSheet({
    title: item.status === "error" ? "错误详情" : "警告详情",
    message: recordText(item),
    cancelButton: false,
    actions: [{ label: "复制日志" }, { label: "关闭" }],
  });
  if (index === 0) await Pasteboard.setString(recordText(item));
}

function RecordContent({ item }: { item: RunRecord }) {
  const inspectable = item.status === "error" || item.status === "warning";
  return (
    <HStack
      spacing={8}
      alignment="top"
      padding={{ vertical: true }}
      frame={{ minHeight: 44, maxWidth: "infinity" }}
      contentShape="rect"
    >
      <Text
        font={12}
        foregroundStyle="secondaryLabel"
        frame={{ width: 36, alignment: "leading" }}
      >
        {recordTime(item.at)}
      </Text>
      {item.provider ? (
        <ProviderLogo provider={item.provider} size={16} />
      ) : (
        <Image
          systemName="gearshape.fill"
          resizable
          scaleToFit
          foregroundStyle="secondaryLabel"
          frame={{ width: 16, height: 16 }}
        />
      )}
      <VStack
        alignment="leading"
        spacing={2}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        <Text font={14} fontWeight="semibold" lineLimit={1}>
          {providerName(item.provider)}
          {item.accountLabel ? ` · ${item.accountLabel}` : ""}
        </Text>
        <Text
          font={13}
          foregroundStyle={statusColor(item.status)}
          lineLimit={2}
        >
          {item.summary}
          {item.detail ? ` · ${item.detail}` : ""}
        </Text>
      </VStack>
      {inspectable ? (
        <Image
          systemName="exclamationmark.circle.fill"
          foregroundStyle={statusColor(item.status)}
        />
      ) : null}
    </HStack>
  );
}

function RecordRow({ item }: { item: RunRecord }) {
  const inspectable = item.status === "error" || item.status === "warning";
  return inspectable ? (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      action={() => {
        void showRecordDetail(item);
      }}
    >
      <RecordContent item={item} />
    </Button>
  ) : (
    <RecordContent item={item} />
  );
}

function LogRowBackground() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular(),
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
    />
  );
}

const logRowBackground = <LogRowBackground />;

function RecordGroup(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: "infinity" }}
      listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
    >
      {props.children}
    </VStack>
  );
}

export function LogPage(props: { backgroundTheme: BackgroundThemeId }) {
  const [items, setItems] = useState(() => readRunRecords());
  const grouped = items.reduce<Record<string, RunRecord[]>>((out, item) => {
    const key = day(item.at);
    (out[key] ||= []).push(item);
    return out;
  }, {});

  async function clear() {
    const index = await Dialog.actionSheet({
      title: "清空运行记录？",
      message: "只删除运行记录，不影响账号、缓存或设置。",
      actions: [{ label: "清空", destructive: true }],
    });
    if (index === 0) {
      clearRunRecords();
      setItems([]);
    }
  }

  return (
    <List
      onAppear={() => setItems(readRunRecords())}
      navigationTitle="运行记录"
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      listStyle="plain"
      listRowSpacing={12}
      listSectionSpacing={12}
      contentMargins={{
        edges: "horizontal",
        insets: 16,
        placement: "scrollContent",
      }}
      background={<PageBackground theme={props.backgroundTheme} />}
      toolbar={{
        topBarTrailing: (
          <Button
            title="清空"
            systemImage="trash"
            role="destructive"
            labelStyle="iconOnly"
            action={clear}
          />
        ),
      }}
    >
      {!items.length ? (
        <Section listRowBackground={logRowBackground}>
          <RecordGroup>
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            >
              暂无运行记录
            </Text>
          </RecordGroup>
        </Section>
      ) : (
        Object.entries(grouped).map(([date, list]) => (
          <Section
            key={date}
            header={<Text foregroundStyle="secondaryLabel">{date}</Text>}
            listRowBackground={logRowBackground}
          >
            <RecordGroup>
              {list.map((item, index) => (
                <VStack
                  key={item.id}
                  spacing={0}
                  frame={{ maxWidth: "infinity" }}
                >
                  <RecordRow item={item} />
                  {index < list.length - 1 ? <Divider /> : null}
                </VStack>
              ))}
            </RecordGroup>
          </Section>
        ))
      )}
    </List>
  );
}
