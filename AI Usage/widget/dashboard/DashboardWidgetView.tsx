import {
  HStack,
  Image,
  ProgressView,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
} from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { ProviderLogo } from "../../components/ProviderLogo";
import { providerMeta, type ProviderId, type UsageCard } from "../../models";
import { usageTint } from "../../services/usage-colors";

type Props = {
  cards: UsageCard[];
  family: string;
  hasErrors?: boolean;
};

type DashboardRow = {
  key: string;
  provider: ProviderId;
  accountTitle: string;
  planLabel: string | null;
  windowLabel: string;
  usedPercent: number | null;
  remainingPercent: number | null;
};

const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
  light,
  dark,
});
const C: Record<string, Color | DynamicShapeStyle> = {
  bg: "systemBackground",
  primary: "label",
  secondary: "secondaryLabel",
  track: dynamic("#D9D9DE", "#3A3A3C"),
  warn: "systemOrange",
};

function widgetSize(family: string): "small" | "medium" | "large" {
  const value = family.toLowerCase();
  if (value.includes("large")) return "large";
  if (value.includes("medium")) return "medium";
  return "small";
}

function displayWidth(family: string): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize
      ?.width;
    if (width && width > 40) return width;
  } catch {
    /* ignore */
  }
  const size = widgetSize(family);
  if (size === "large") return 364;
  if (size === "medium") return 338;
  return 158;
}

function flattenCards(cards: UsageCard[]): DashboardRow[] {
  const rows: DashboardRow[] = [];
  for (const card of cards) {
    for (const window of card.windows) {
      rows.push({
        key: `${card.key}:${window.id}`,
        provider: card.provider,
        accountTitle: card.title,
        planLabel: card.planLabel,
        windowLabel: window.label,
        usedPercent: window.usedPercent,
        remainingPercent: window.remainingPercent,
      });
    }
  }
  return rows;
}

function providerShortName(provider: ProviderId): string {
  if (provider === "codex") return "ChatGPT";
  if (provider === "antigravity") return "Agy";
  return providerMeta(provider).title;
}

function shortWindowLabel(label: string): string {
  const value = label.trim().toLowerCase();
  if (value.includes("周") || value.includes("week")) return "Weekly";
  if (value.includes("5") && (value.includes("时") || value.includes("hour")))
    return "Session";
  if (value.includes("session")) return "Session";
  if (value.includes("auto")) return "Auto";
  if (value.includes("月") || value.includes("month")) return "Monthly";
  if (value.includes("api")) return "API";
  if (value.includes("grok") && value.includes("bot")) return "Grok Bot";
  if (value.includes("total") || value.includes("总计")) return "Total";
  if (label.length <= 10) return label;
  return `${label.slice(0, 9)}…`;
}

function ringValue(remainingPercent: number | null): number {
  if (remainingPercent == null || Number.isNaN(remainingPercent)) return 0;
  return Math.max(0, Math.min(100, remainingPercent));
}

function ringCenterText(remainingPercent: number | null): string {
  if (remainingPercent == null || Number.isNaN(remainingPercent)) return "—";
  return String(Math.round(remainingPercent));
}

function UsageRing(props: {
  row: DashboardRow;
  size: number;
  compact?: boolean;
  showAccount?: boolean;
}) {
  const value = ringValue(props.row.remainingPercent);
  const tint = usageTint(props.row.usedPercent, props.row.remainingPercent);
  const logo = props.compact ? 10 : 12;
  const titleFont = props.compact ? 9 : 10;
  const subFont = props.compact ? 8 : 9;

  return (
    <VStack
      alignment="center"
      spacing={props.compact ? 3 : 4}
      frame={{ maxWidth: "infinity" }}
    >
      <ZStack frame={{ width: props.size, height: props.size }}>
        <ProgressView
          value={100}
          total={100}
          progressViewStyle="circular"
          tint={C.track}
          scaleEffect={{ x: 1.08, y: 1.08 }}
        />
        <ProgressView
          value={value}
          total={100}
          progressViewStyle="circular"
          tint={tint}
          scaleEffect={{ x: 1.08, y: 1.08 }}
        />
        <Text
          font={props.size * 0.3}
          fontWeight="bold"
          monospacedDigit
          foregroundStyle={C.primary}
          minimumScaleFactor={0.7}
        >
          {ringCenterText(props.row.remainingPercent)}
        </Text>
      </ZStack>
      <HStack alignment="center" spacing={3}>
        <ProviderLogo provider={props.row.provider} size={logo} />
        <Text
          font={titleFont}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {providerShortName(props.row.provider)}
        </Text>
      </HStack>
      <Text
        font={subFont}
        foregroundStyle={C.secondary}
        lineLimit={1}
        minScaleFactor={0.75}
      >
        {shortWindowLabel(props.row.windowLabel)}
      </Text>
    </VStack>
  );
}

function EmptyView({ message }: { message: string }) {
  return (
    <VStack
      alignment="center"
      spacing={8}
      padding={16}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <Image
        systemName="chart.bar.doc.horizontal.fill"
        font={22}
        foregroundStyle="secondaryLabel"
      />
      <Spacer />
      <Text font={13} fontWeight="bold">
        总用量
      </Text>
      <Text
        font={10}
        foregroundStyle="secondaryLabel"
        lineLimit={4}
        multilineTextAlignment="center"
      >
        {message}
      </Text>
    </VStack>
  );
}

function RingRow(props: {
  rows: DashboardRow[];
  ringSize: number;
  columns: number;
  compact?: boolean;
  showAccount?: boolean;
}) {
  const visible = props.rows.slice(0, props.columns);
  return (
    <HStack alignment="top" spacing={props.compact ? 6 : 8}>
      {visible.map((row) => (
        <UsageRing
          key={row.key}
          row={row}
          size={props.ringSize}
          compact={props.compact}
          showAccount={props.showAccount}
        />
      ))}
      {visible.length < props.columns
        ? Array.from({ length: props.columns - visible.length }).map((_, index) => (
            <Spacer key={`pad-${index}`} minLength={0} />
          ))
        : null}
    </HStack>
  );
}

export function DashboardWidgetView(props: Props) {
  const rows = flattenCards(props.cards);
  const size = widgetSize(props.family);
  const width = displayWidth(props.family);
  const accountCount = props.cards.length;

  if (rows.length === 0) {
    return (
      <EmptyView
        message={
          accountCount === 0
            ? "请先在 AI Usage 连接账号，或在设置中为总览小组件选择展示内容。"
            : "所选账号暂无可见额度条目，请在设置中调整小组件总览。"
        }
      />
    );
  }

  if (size === "small") {
    const columns = Math.min(2, rows.length);
    const ringSize = Math.max(52, Math.floor((width - 24 - (columns - 1) * 8) / columns));
    return (
      <VStack
        alignment="center"
        spacing={0}
        padding={12}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        widgetBackground={C.bg}
      >
        <Spacer minLength={0} />
        <RingRow
          rows={rows}
          ringSize={ringSize}
          columns={columns}
          compact
          showAccount={accountCount > 1}
        />
        {rows.length > columns ? (
          <Text font={8} foregroundStyle={C.secondary} padding={{ top: 6 }}>
            +{rows.length - columns}
          </Text>
        ) : null}
        <Spacer minLength={0} />
      </VStack>
    );
  }

  if (size === "medium") {
    const columns = Math.min(5, rows.length);
    const ringSize = Math.max(
      48,
      Math.floor((width - 24 - (columns - 1) * 10) / columns),
    );
    return (
      <VStack
        alignment="center"
        spacing={0}
        padding={{ horizontal: 12, vertical: 14 }}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        widgetBackground={C.bg}
      >
        <Spacer minLength={0} />
        <RingRow
          rows={rows}
          ringSize={ringSize}
          columns={columns}
          showAccount={accountCount > 1}
        />
        {rows.length > columns ? (
          <Text font={9} foregroundStyle={C.secondary} padding={{ top: 8 }}>
            另有 {rows.length - columns} 条 · 可添加大尺寸查看更多
          </Text>
        ) : props.hasErrors ? (
          <Image
            systemName="exclamationmark.triangle.fill"
            foregroundStyle={C.warn}
            font={9}
            padding={{ top: 6 }}
          />
        ) : null}
        <Spacer minLength={0} />
      </VStack>
    );
  }

  const columns = 4;
  const ringSize = Math.max(
    56,
    Math.floor((width - 32 - (columns - 1) * 12) / columns),
  );
  const firstRow = rows.slice(0, columns);
  const secondRow = rows.slice(columns, columns * 2);
  const hidden = Math.max(0, rows.length - columns * 2);

  return (
    <VStack
      alignment="center"
      spacing={14}
      padding={16}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <Spacer minLength={0} />
      <RingRow
        rows={firstRow}
        ringSize={ringSize}
        columns={columns}
        showAccount={accountCount > 1}
      />
      {secondRow.length > 0 ? (
        <RingRow
          rows={secondRow}
          ringSize={ringSize}
          columns={columns}
          showAccount={accountCount > 1}
        />
      ) : null}
      {hidden > 0 ? (
        <Text font={10} foregroundStyle={C.secondary}>
          另有 {hidden} 条未显示
        </Text>
      ) : props.hasErrors ? (
        <Image
          systemName="exclamationmark.triangle.fill"
          foregroundStyle={C.warn}
          font={10}
        />
      ) : null}
      <Spacer minLength={0} />
    </VStack>
  );
}
