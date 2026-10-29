import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import type { UsageCard } from "../models";
import {
  currencySymbol,
  formatBalanceAmount,
  selectBalanceWindow,
} from "../providers/deepseek/format";

function hasDigits(value: string): boolean {
  return /\d/.test(value);
}

function amountWithSymbol(
  value: string | null | undefined,
  currency: string,
): string {
  if (value == null || !currency) return "—";
  return formatBalanceAmount(value, currency, true) || "—";
}

/** 总余额：符号略小，金额保持卡片内的主视觉。 */
function Money(props: {
  value: string | null | undefined;
  currency: string;
  symbolFont: number;
  amountFont: number;
}) {
  if (!props.currency || props.value == null) {
    return (
      <Text font={props.amountFont} fontWeight="bold" lineLimit={1}>
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
          lineLimit={1}
          monospacedDigit
        >
          {symbol}
        </Text>
      ) : null}
      <Text
        font={props.amountFont}
        fontWeight="bold"
        lineLimit={1}
        minScaleFactor={0.5}
        monospacedDigit
        layoutPriority={1}
      >
        {amount}
      </Text>
    </HStack>
  );
}

function InfoRow(props: { label: string; value: string; top: number }) {
  return (
    <HStack frame={{ maxWidth: "infinity" }} padding={{ top: props.top }}>
      <Text
        font={15}
        fontWeight="medium"
        foregroundStyle="secondaryLabel"
        lineLimit={1}
      >
        {props.label}
      </Text>
      <Spacer minLength={8} />
      <Text
        font={15}
        fontWeight="semibold"
        lineLimit={1}
        minScaleFactor={0.7}
        monospacedDigit
        layoutPriority={1}
      >
        {props.value}
      </Text>
    </HStack>
  );
}

/**
 * 应用内用量卡正文：平铺总余额及充值、赠金余额。
 * 账号头与来源时间脚由 UsageCardView 统一提供，这里不重复。
 */
export function DeepseekUsageCardBody(props: { card: UsageCard }) {
  const window = selectBalanceWindow(props.card.windows);
  const balance = window?.balance ?? null;

  if (!balance) {
    return (
      <VStack alignment="leading" spacing={0}>
        <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
          暂无余额
        </Text>
      </VStack>
    );
  }

  const currency = balance.currency;

  return (
    <VStack
      alignment="leading"
      spacing={0}
      frame={{ maxWidth: "infinity" }}
    >
      <HStack alignment="lastTextBaseline" frame={{ maxWidth: "infinity" }}>
        <Text font={15} fontWeight="medium" lineLimit={1}>
          可用余额
        </Text>
        <Spacer minLength={8} />
        <Money
          value={balance.total}
          currency={currency}
          symbolFont={12}
          amountFont={20}
        />
      </HStack>

      <Divider padding={{ top: 8 }} />

      <InfoRow
        label="充值余额"
        value={amountWithSymbol(balance.paid, currency)}
        top={8}
      />
      <InfoRow
        label="赠金余额"
        value={amountWithSymbol(balance.granted, currency)}
        top={6}
      />

    </VStack>
  );
}
