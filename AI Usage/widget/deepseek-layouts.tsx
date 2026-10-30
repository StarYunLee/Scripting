import {
  HStack,
  Image,
  Script,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
} from "scripting";
import type { Color } from "scripting";
import type { UsageBalanceView, UsageWindowView } from "../models";
import { PlanBadge } from "../components/PlanBadge";
import type { WidgetChromeStyle } from "./chrome-style";
import { isWidgetTransparent, widgetTheme as C } from "./transparent";
import {
  currencySymbol,
  formatBalanceAmount,
  selectBalanceWindow,
} from "../providers/deepseek/format";

export type DeepseekLayoutProps = {
  width: number;
  windows: UsageWindowView[];
  watermarkPath: string;
  fetchedText: string;
  errorText?: string;
  chromeStyle?: WidgetChromeStyle;
};

type BalanceTone = "ok" | "warn" | "muted";

type BalanceStatus = {
  short: string;
  long: string;
  tone: BalanceTone;
};

function displayHeight(): number {
  try {
    const height = (Widget as { displaySize?: { height?: number } }).displaySize
      ?.height;
    if (height && height > 40) return height;
  } catch {
    /* ignore */
  }
  return 158;
}

function balanceOf(window: UsageWindowView | null): UsageBalanceView | null {
  return window?.balance ?? null;
}

function hasDigits(value: string): boolean {
  return /\d/.test(value);
}

function isZeroAmount(value: string | null | undefined): boolean {
  return typeof value === "string" && /^0+(?:\.0+)?$/.test(value.trim());
}

/**
 * 余额状态只描述“能否用于 API 调用”，不把 is_available 当成服务健康监测。
 * 查询失败时保留原金额与原时间，仅把状态改为缓存/失败。
 */
function isCacheStatus(errorText?: string): boolean {
  const detail = (errorText || "").trim();
  if (!detail) return false;
  // “本轮用量已获取，但缓存保存失败”说明数据是新的，不应标成获取失败。
  if (
    /缓存保存失败/.test(detail) &&
    !/获取失败|查询失败|授权|限流|网络|超时|错误/.test(detail)
  ) {
    return false;
  }
  return true;
}

function balanceStatus(
  balance: UsageBalanceView | null,
  errorText?: string,
): BalanceStatus {
  const detail = (errorText || "").trim();
  if (detail && isCacheStatus(detail)) {
    if (/授权|unauthorized|401/i.test(detail)) {
      return {
        short: "授权失效",
        long: "授权已失效，请重新连接",
        tone: "warn",
      };
    }
    if (/数据较旧|数据过期|stale/i.test(detail)) {
      return {
        short: "数据较旧",
        long: "数据较旧 · 显示缓存余额",
        tone: "warn",
      };
    }
    const long = /获取失败|查询失败/.test(detail)
      ? detail
      : detail === "自动刷新失败"
        ? "获取失败 · 显示缓存余额"
        : `获取失败 · ${detail}`;
    return { short: "获取失败", long, tone: "warn" };
  }
  if (!balance) {
    return { short: "暂无余额", long: "暂无余额", tone: "muted" };
  }
  if (!balance.isAvailable) {
    if (isZeroAmount(balance.total)) {
      return { short: "余额为零", long: "余额为零，请充值", tone: "warn" };
    }
    return {
      short: "不可用",
      long: "当前余额不可用于 API 调用",
      tone: "warn",
    };
  }
  return { short: "可用", long: "余额可供 API 调用", tone: "ok" };
}

function statusColor(tone: BalanceTone): Color {
  if (tone === "ok") {
    return (isWidgetTransparent() ? "#30D158" : "systemGreen") as Color;
  }
  if (tone === "warn") return C.warn;
  return C.secondary;
}

function StatusMark(props: { tone: BalanceTone; font?: number }) {
  return (
    <Image
      systemName={
        props.tone === "ok"
          ? "circle.fill"
          : props.tone === "warn"
            ? "exclamationmark.triangle.fill"
            : "minus.circle"
      }
      font={
        props.font ??
        (props.tone === "ok" ? 5 : props.tone === "warn" ? 7 : 6)
      }
      foregroundStyle={statusColor(props.tone)}
    />
  );
}

function Watermark(props: { path: string }) {
  // 透明/模糊模式不绘制水印，避免在系统背景上留下污斑。
  if (isWidgetTransparent() || !props.path) return null;
  return (
    <Image
      filePath={`${Script.directory}/${props.path}`}
      resizable
      scaleToFit
      renderingMode="template"
      foregroundStyle={{
        light: "rgba(35,35,38,0.09)",
        dark: "rgba(245,245,247,0.075)",
      }}
      frame={{ width: 96, height: 96 }}
    />
  );
}

/** 金额文本：符号单独缩小，数字保持主色与等宽数字。 */
function Money(props: {
  value: string | null | undefined;
  currency: string;
  symbolFont: number;
  amountFont: number;
  fontWeight?: "bold" | "semibold";
}) {
  const shadow = C.textShadow;
  if (!props.currency || props.value == null) {
    return (
      <Text
        font={props.amountFont}
        fontWeight={props.fontWeight ?? "bold"}
        foregroundStyle={C.primary}
        lineLimit={1}
        {...(shadow ? { shadow } : {})}
      >
        —
      </Text>
    );
  }
  const amount = formatBalanceAmount(props.value, props.currency, false) || "—";
  // 未知但合法的币种没有符号时保留显式 code，不猜符号或地区。
  const symbolCode = currencySymbol(props.currency);
  const symbol = symbolCode || props.currency;
  return (
    <HStack alignment="lastTextBaseline" spacing={symbolCode ? 1 : 3}>
      {symbol && hasDigits(amount) ? (
        <Text
          font={props.symbolFont}
          fontWeight="semibold"
          foregroundStyle={C.primary}
          lineLimit={1}
          {...(shadow ? { shadow } : {})}
        >
          {symbol}
        </Text>
      ) : null}
      <Text
        font={props.amountFont}
        fontWeight={props.fontWeight ?? "bold"}
        foregroundStyle={C.primary}
        lineLimit={1}
        minScaleFactor={0.45}
        monospacedDigit
        layoutPriority={1}
        {...(shadow ? { shadow } : {})}
      >
        {amount}
      </Text>
    </HStack>
  );
}

function plainAmount(
  value: string | null | undefined,
  currency: string,
): string {
  if (value == null || !currency) return "—";
  return formatBalanceAmount(value, currency, false) || "—";
}

/** “10:42 刷新” → “10:42”，避免与左侧“刷新时间”重复。 */
function refreshValue(text: string, hasError: boolean): string {
  const trimmed = (text || "").trim();
  if (!trimmed) return "—";
  const match = /(\d{1,2}:\d{2})/.exec(trimmed);
  if (match) return match[1];
  const cleaned = trimmed.replace(/\s*(刷新|更新)(时间)?$/u, "").trim();
  if (hasError && /失败|错误|error/i.test(cleaned)) return "—";
  return cleaned || "—";
}

/** 顶栏时间：保留原时间，错误时明确标成缓存。 */
function headerTime(text: string, hasError: boolean): string {
  const trimmed = (text || "").trim();
  const match = /(\d{1,2}:\d{2})/.exec(trimmed);
  if (match) return `${match[1]} ${hasError ? "缓存" : "刷新"}`;
  if (!trimmed) return hasError ? "缓存" : "—";
  if (hasError && /失败|错误|error/i.test(trimmed)) return "缓存";
  if (/刷新|缓存/.test(trimmed)) return trimmed;
  return `${trimmed} ${hasError ? "缓存" : "刷新"}`;
}

function MetaRow(props: {
  label: string;
  value: string;
  width: number;
}) {
  const shadow = C.textShadow;
  const font = 10;
  return (
    <HStack frame={{ width: props.width }}>
      <Text
        font={font}
        fontWeight="medium"
        foregroundStyle={C.secondary}
        lineLimit={1}
        {...(shadow ? { shadow } : {})}
      >
        {props.label}
      </Text>
      <Spacer minLength={4} />
      <Text
        font={font}
        fontWeight="semibold"
        foregroundStyle={C.primary}
        lineLimit={1}
        minScaleFactor={0.75}
        monospacedDigit
        {...(shadow ? { shadow } : {})}
      >
        {props.value}
      </Text>
    </HStack>
  );
}

/**
 * Small：总余额是视觉中心，下方固定“充值 / 赠金 / 刷新时间”三行。
 * 不绘制任何进度条，也不生成剩余百分比。
 */
export function DeepseekSmallLayout(props: DeepseekLayoutProps) {
  const balance = balanceOf(selectBalanceWindow(props.windows));
  const currency = balance?.currency ?? "";
  const status = balanceStatus(balance, props.errorText);
  const cacheState = isCacheStatus(props.errorText);
  const contentWidth = Math.max(90, props.width - 24);
  const offset = Math.max(0, (displayHeight() - 158) / 2);
  const shadow = C.textShadow;

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "bottomTrailing",
        }}
        padding={{ trailing: -8, bottom: -12 }}
      >
        <Watermark path={props.watermarkPath} />
      </HStack>

      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: 11 + offset }}
      >
        <PlanBadge
          provider="deepseek"
          label="DeepSeek"
          size="widget-small"
          chromeStyle={props.chromeStyle}
        />
      </HStack>

      <HStack
        spacing={4}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: 36 + offset }}
      >
        <Text
          font={14}
          fontWeight="bold"
          foregroundStyle={C.primary}
          lineLimit={1}
          {...(shadow ? { shadow } : {})}
        >
          账户余额
        </Text>
        <Spacer minLength={4} />
        <StatusMark tone={status.tone} />
        <Text
          font={12}
          fontWeight="semibold"
          foregroundStyle={statusColor(status.tone)}
          lineLimit={1}
          minScaleFactor={0.75}
          {...(shadow ? { shadow } : {})}
        >
          {status.short}
        </Text>
      </HStack>

      <HStack
        alignment="lastTextBaseline"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: 55 + offset }}
      >
        <Money
          value={balance?.total ?? null}
          currency={currency}
          symbolFont={17.5}
          amountFont={32}
        />
      </HStack>

      <VStack
        alignment="leading"
        spacing={5}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: 99 + offset }}
      >
        <MetaRow
          label="充值余额"
          value={plainAmount(balance?.paid, currency)}
          width={contentWidth}
        />
        <MetaRow
          label="赠金余额"
          value={plainAmount(balance?.granted, currency)}
          width={contentWidth}
        />
        <MetaRow
          label={cacheState ? "缓存时间" : "刷新时间"}
          value={refreshValue(props.fetchedText, cacheState)}
          width={contentWidth}
        />
      </VStack>
    </ZStack>
  );
}

function BreakdownRow(props: {
  label: string;
  value: string | null | undefined;
  currency: string;
}) {
  const shadow = C.textShadow;
  return (
    <VStack alignment="leading" spacing={3}>
      <Text
        font={10}
        fontWeight="medium"
        foregroundStyle={C.secondary}
        lineLimit={1}
        {...(shadow ? { shadow } : {})}
      >
        {props.label}
      </Text>
      <Money
        value={props.value}
        currency={props.currency}
        symbolFont={11}
        amountFont={17}
        fontWeight="semibold"
      />
    </VStack>
  );
}

/**
 * Medium：顶栏徽章 + 时间；左侧总余额与可用状态，右侧充值/赠金拆分。
 * 左右区块只隔一条 1px 分隔线，不套第二层卡片。
 */
export function DeepseekMediumLayout(props: DeepseekLayoutProps) {
  const balance = balanceOf(selectBalanceWindow(props.windows));
  const currency = balance?.currency ?? "";
  const status = balanceStatus(balance, props.errorText);
  const cacheState = isCacheStatus(props.errorText);
  const contentWidth = Math.max(180, props.width - 40);
  const columnGap = 18;
  const available = Math.max(120, contentWidth - columnGap);
  const leftWidth = Math.round(available * (1.25 / 2.25) * 10) / 10;
  const rightWidth = available - leftWidth;
  const offset = Math.max(0, (displayHeight() - 158) / 2);
  const shadow = C.textShadow;

  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "bottomTrailing",
        }}
        padding={{ trailing: -8, bottom: -12 }}
      >
        <Watermark path={props.watermarkPath} />
      </HStack>

      <HStack
        alignment="center"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 14 + offset }}
      >
        <PlanBadge
          provider="deepseek"
          label="DeepSeek"
          size="widget"
          chromeStyle={props.chromeStyle}
        />
        <Spacer />
        <Text
          font={10}
          fontWeight="medium"
          foregroundStyle={C.secondary}
          lineLimit={1}
          {...(shadow ? { shadow } : {})}
        >
          {headerTime(props.fetchedText, cacheState)}
        </Text>
      </HStack>

      <HStack
        alignment="top"
        spacing={columnGap}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 48 + offset }}
      >
        <VStack alignment="leading" spacing={0} frame={{ width: leftWidth }}>
          <Text
            font={16}
            fontWeight="semibold"
            foregroundStyle={C.primary}
            lineLimit={1}
            {...(shadow ? { shadow } : {})}
          >
            账户余额
          </Text>
          <HStack alignment="lastTextBaseline" padding={{ top: 4 }}>
            <Money
              value={balance?.total ?? null}
              currency={currency}
              symbolFont={18}
              amountFont={32}
            />
          </HStack>
          <HStack spacing={4} padding={{ top: 6 }}>
            <StatusMark tone={status.tone} />
            <Text
              font={12}
              fontWeight="medium"
              foregroundStyle={statusColor(status.tone)}
              lineLimit={1}
              minScaleFactor={0.7}
              {...(shadow ? { shadow } : {})}
            >
              {status.long}
            </Text>
          </HStack>
        </VStack>

        <HStack alignment="top" spacing={17} frame={{ width: rightWidth }}>
          <HStack frame={{ width: 1, height: 82 }} background={C.divider} />
          <VStack
            alignment="leading"
            spacing={12}
            frame={{ width: Math.max(60, rightWidth - 18) }}
          >
            <BreakdownRow
              label="充值余额"
              value={balance?.paid ?? null}
              currency={currency}
            />
            <BreakdownRow
              label="赠金余额"
              value={balance?.granted ?? null}
              currency={currency}
            />
          </VStack>
        </HStack>
      </HStack>
    </ZStack>
  );
}

/** Compact dashboard wallet row; account details remain in the dedicated layouts. */
export function DeepseekDashboardBalanceRow(props: {
  window: UsageWindowView;
  width: number;
  compact: boolean;
  chromeStyle?: WidgetChromeStyle;
  errorText?: string;
}) {
  const balance = props.window.balance ?? null;
  const currency = balance?.currency ?? "";
  const status = balanceStatus(balance, props.errorText);
  const shadow = C.textShadow;
  const detailFont = props.compact ? 10 : 11;
  const warningFont = props.compact ? 8.5 : 9;
  const mark = currencySymbol(currency);
  const amountText = (value: string | null | undefined) => {
    const amount = plainAmount(value, currency);
    return amount === "—" ? amount : `${mark}${mark.length > 1 ? " " : ""}${amount}`;
  };

  return (
    <VStack alignment="leading"
      spacing={status.tone === "ok" ? (props.compact ? 8 : 10) : (props.compact ? 2 : 3)}
      frame={{ width: props.width }}>
      <HStack alignment="lastTextBaseline" spacing={4} frame={{ width: props.width }}>
        <Text font={11} fontWeight="semibold" foregroundStyle={C.secondary}
          lineLimit={1} minScaleFactor={0.75} {...(shadow ? { shadow } : {})}>
          账户余额
        </Text>
        <Spacer minLength={0} />
        <Money value={balance?.total ?? null} currency={currency}
          symbolFont={props.compact ? 12 : 13} amountFont={props.compact ? 13 : 14}
          fontWeight="semibold" />
      </HStack>

      <HStack alignment="lastTextBaseline" spacing={6} frame={{ width: props.width }}>
        <Text font={detailFont} fontWeight="medium" foregroundStyle={C.secondary}
          lineLimit={1} minScaleFactor={0.75} monospacedDigit {...(shadow ? { shadow } : {})}>
          {`充值 ${amountText(balance?.paid)}`}
        </Text>
        <Spacer minLength={2} />
        <Text font={detailFont} fontWeight="medium" foregroundStyle={C.secondary}
          lineLimit={1} minScaleFactor={0.75} monospacedDigit {...(shadow ? { shadow } : {})}>
          {`赠金 ${amountText(balance?.granted)}`}
        </Text>
      </HStack>
      {status.tone !== "ok" ? (
        <HStack alignment="top" spacing={4} frame={{ width: props.width }}>
          <StatusMark tone={status.tone} />
          <Text font={warningFont} fontWeight="medium" foregroundStyle={statusColor(status.tone)}
            lineLimit={2} {...(shadow ? { shadow } : {})}>
            {status.long}
          </Text>
        </HStack>
      ) : null}
    </VStack>
  );
}
