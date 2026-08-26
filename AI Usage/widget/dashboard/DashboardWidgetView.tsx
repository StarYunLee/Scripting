import {
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
} from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { PlanBadge } from "../../components/PlanBadge";
import { formatPercent } from "../../providers/codex/format";
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
  track: dynamic("#C7C8CC", "#55565C"),
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

function shortAccountTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= 14) return trimmed;
  const at = trimmed.indexOf("@");
  if (at > 0 && at < trimmed.length - 1) {
    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    if (local.length > 8) return `${local.slice(0, 6)}…@${domain}`;
  }
  return `${trimmed.slice(0, 12)}…`;
}

function ProgressBar(props: {
  value: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  width: number;
  height: number;
}) {
  const shown =
    props.value == null ? null : Math.max(0, Math.min(100, props.value));
  const fill = shown == null ? 0 : (props.width * shown) / 100;
  return (
    <ZStack alignment="leading" frame={{ width: props.width, height: props.height }}>
      <HStack
        frame={{ width: props.width, height: props.height }}
        background={C.track}
        clipShape={{ type: "capsule", style: "continuous" }}
      />
      {fill > 0 ? (
        <HStack
          frame={{ width: Math.max(props.height, fill), height: props.height }}
          background={usageTint(props.usedPercent, props.remainingPercent)}
          clipShape={{ type: "capsule", style: "continuous" }}
        />
      ) : null}
    </ZStack>
  );
}

function EmptyView({ message }: { message: string }) {
  return (
    <VStack
      alignment="leading"
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
      <Text font={15} fontWeight="bold">
        总用量
      </Text>
      <Text font={11} foregroundStyle="secondaryLabel" lineLimit={4}>
        {message}
      </Text>
    </VStack>
  );
}

function Header(props: {
  accountCount: number;
  rowCount: number;
  compact?: boolean;
  hasErrors?: boolean;
}) {
  return (
    <HStack alignment="center">
      <Text
        font={props.compact ? 12 : 14}
        fontWeight="bold"
        foregroundStyle={C.primary}
      >
        总用量
      </Text>
      <Spacer minLength={0} />
      <Text
        font={props.compact ? 8 : 9}
        fontWeight="medium"
        foregroundStyle={C.secondary}
        lineLimit={1}
      >
        {props.accountCount} 账号 · {props.rowCount} 条目
      </Text>
      {props.hasErrors ? (
        <Image
          systemName="exclamationmark.triangle.fill"
          foregroundStyle={C.warn}
          font={props.compact ? 8 : 9}
        />
      ) : null}
    </HStack>
  );
}

function RowSmall(props: { row: DashboardRow }) {
  const meta = providerMeta(props.row.provider);
  const label = `${meta.title} · ${props.row.windowLabel}`;
  return (
    <HStack alignment="center" spacing={6}>
      <Text
        font={10}
        fontWeight="semibold"
        foregroundStyle={C.primary}
        lineLimit={1}
        minScaleFactor={0.7}
        frame={{ maxWidth: 92 }}
      >
        {label}
      </Text>
      <Spacer minLength={0} />
      <Text font={10} fontWeight="bold" monospacedDigit foregroundStyle={C.primary}>
        {formatPercent(props.row.remainingPercent)}
      </Text>
    </HStack>
  );
}

function RowMedium(props: {
  row: DashboardRow;
  width: number;
  showAccount?: boolean;
}) {
  const meta = providerMeta(props.row.provider);
  return (
    <VStack alignment="leading" spacing={4}>
      <HStack alignment="center" spacing={6}>
        <PlanBadge
          provider={props.row.provider}
          label={props.row.planLabel || meta.title}
          small
        />
        <Text
          font={10}
          foregroundStyle={C.secondary}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {props.showAccount ? shortAccountTitle(props.row.accountTitle) : props.row.windowLabel}
        </Text>
        <Spacer minLength={0} />
        <Text font={11} fontWeight="bold" monospacedDigit foregroundStyle={C.primary}>
          剩余 {formatPercent(props.row.remainingPercent)}
        </Text>
      </HStack>
      <ProgressBar
        value={props.row.remainingPercent}
        usedPercent={props.row.usedPercent}
        remainingPercent={props.row.remainingPercent}
        width={props.width}
        height={5}
      />
    </VStack>
  );
}

function RowLarge(props: { row: DashboardRow; width: number }) {
  const meta = providerMeta(props.row.provider);
  return (
    <VStack alignment="leading" spacing={5}>
      <HStack alignment="center" spacing={8}>
        <PlanBadge
          provider={props.row.provider}
          label={props.row.planLabel || meta.title}
        />
        <VStack alignment="leading" spacing={1}>
          <Text font={12} fontWeight="semibold" lineLimit={1} minScaleFactor={0.8}>
            {shortAccountTitle(props.row.accountTitle)}
          </Text>
          <Text font={10} foregroundStyle={C.secondary} lineLimit={1}>
            {props.row.windowLabel}
          </Text>
        </VStack>
        <Spacer minLength={0} />
        <Text font={13} fontWeight="bold" monospacedDigit foregroundStyle={C.primary}>
          {formatPercent(props.row.remainingPercent)}
        </Text>
      </HStack>
      <ProgressBar
        value={props.row.remainingPercent}
        usedPercent={props.row.usedPercent}
        remainingPercent={props.row.remainingPercent}
        width={props.width}
        height={6}
      />
    </VStack>
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
    const visible = rows.slice(0, 4);
    const hidden = rows.length - visible.length;
    const pad = 12;
    return (
      <VStack
        alignment="leading"
        spacing={8}
        padding={pad}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        widgetBackground={C.bg}
      >
        <Header
          accountCount={accountCount}
          rowCount={rows.length}
          compact
          hasErrors={props.hasErrors}
        />
        <VStack alignment="leading" spacing={7}>
          {visible.map((row) => (
            <RowSmall key={row.key} row={row} />
          ))}
        </VStack>
        {hidden > 0 ? (
          <Text font={9} foregroundStyle={C.secondary}>
            另有 {hidden} 条未显示
          </Text>
        ) : null}
        <Spacer minLength={0} />
      </VStack>
    );
  }

  if (size === "medium") {
    const visible = rows.slice(0, 5);
    const hidden = rows.length - visible.length;
    const contentWidth = Math.max(220, width - 32);
    return (
      <VStack
        alignment="leading"
        spacing={10}
        padding={16}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        widgetBackground={C.bg}
      >
        <Header
          accountCount={accountCount}
          rowCount={rows.length}
          hasErrors={props.hasErrors}
        />
        <VStack alignment="leading" spacing={10}>
          {visible.map((row) => (
            <RowMedium
              key={row.key}
              row={row}
              width={contentWidth}
              showAccount={accountCount > 1}
            />
          ))}
        </VStack>
        {hidden > 0 ? (
          <Text font={10} foregroundStyle={C.secondary}>
            另有 {hidden} 条未显示 · 可添加大尺寸小组件查看更多
          </Text>
        ) : null}
        <Spacer minLength={0} />
      </VStack>
    );
  }

  const visible = rows.slice(0, 8);
  const hidden = rows.length - visible.length;
  const contentWidth = Math.max(250, width - 40);
  return (
    <VStack
      alignment="leading"
      spacing={12}
      padding={20}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <Header
        accountCount={accountCount}
        rowCount={rows.length}
        hasErrors={props.hasErrors}
      />
      <VStack alignment="leading" spacing={12}>
        {visible.map((row) => (
          <RowLarge key={row.key} row={row} width={contentWidth} />
        ))}
      </VStack>
      {hidden > 0 ? (
        <Text font={11} foregroundStyle={C.secondary}>
          另有 {hidden} 条未显示
        </Text>
      ) : null}
      <Spacer minLength={0} />
    </VStack>
  );
}
