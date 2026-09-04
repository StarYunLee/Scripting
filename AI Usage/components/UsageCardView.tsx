import {
  Button,
  Divider,
  HStack,
  Image,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from "scripting";
import {
  formatPercent,
  formatRelativeFetchedAt,
  formatRelativeResetAt,
  formatResetDate,
  formatResetExpirationCountdown,
} from "../services/usage-format";
import { providerMeta, type UsageCard } from "../models";
import { usageTint } from "../services/usage-colors";
import { PlanBadge } from "./PlanBadge";
import { ProviderLogo } from "./ProviderLogo";

const CARD_RADIUS = 20;

function footerText(card: UsageCard): {
  text: string;
  color: "secondaryLabel" | "systemRed";
} {
  if (
    card.errorMessage ||
    card.source === "error" ||
    card.refreshStatus === "failure"
  ) {
    return {
      text: card.errorMessage || "刷新失败",
      color: "systemRed",
    };
  }
  const sourceLabel =
    card.source === "live"
      ? "在线"
      : card.source === "cache"
        ? "缓存"
        : card.source === "empty"
          ? "暂无数据"
          : "暂无数据";
  if (!card.fetchedAt || sourceLabel === "暂无数据") {
    return { text: sourceLabel, color: "secondaryLabel" };
  }
  return {
    text: `${sourceLabel} · ${formatRelativeFetchedAt(card.fetchedAt)}`,
    color: "secondaryLabel",
  };
}

function resetCreditsDetailMessage(
  resetCredits: NonNullable<UsageCard["resetCredits"]>,
): string {
  const grouped = new Map<string, number>();
  for (const expiration of resetCredits.expirations) {
    grouped.set(expiration, (grouped.get(expiration) || 0) + 1);
  }
  const rows = Array.from(grouped.entries()).map(
    ([expiration, count], index) =>
      `${index + 1}. ${formatResetDate(expiration)}${count > 1 ? ` × ${count}` : ""}\n   ${formatResetExpirationCountdown(expiration)}`,
  );
  const known = resetCredits.expirations.length;
  const unknown = Math.max(0, resetCredits.available - known);
  if (unknown > 0) {
    rows.push(`另有 ${unknown} 次暂未提供到期时间`);
  }
  if (!rows.length) {
    rows.push("服务暂未提供各次重置的到期时间。");
  }
  return `可用重置 ${resetCredits.available} 次\n\n${rows.join("\n\n")}`;
}

async function showResetCreditsDetail(
  resetCredits: NonNullable<UsageCard["resetCredits"]>,
): Promise<void> {
  await Dialog.alert({
    title: "重置次数详情",
    message: resetCreditsDetailMessage(resetCredits),
    buttonLabel: "知道了",
  });
}

export function UsageCardView(props: {
  card: UsageCard;
  displayMode: "used" | "remaining";
  onRefresh: () => void;
  onOpen?: () => void;
}) {
  const meta = providerMeta(props.card.provider);
  const percentLabel = props.displayMode === "remaining" ? "剩余" : "已用";
  const refreshTitle = props.card.refreshing
    ? "刷新中"
    : props.card.refreshStatus === "success"
      ? "刷新成功"
      : props.card.refreshStatus === "failure"
        ? "刷新失败"
        : "刷新";
  const footer = footerText(props.card);
  return (
    <VStack
      alignment="leading"
      spacing={12}
      padding={16}
      frame={{ maxWidth: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular().interactive(true),
        shape: { type: "rect", cornerRadius: CARD_RADIUS, style: "continuous" },
      }}
      shadow={{ color: "rgba(72,88,120,0.16)", radius: 12, y: 5 }}
      listRowBackground={<></>}
      listRowSeparator="hidden"
      listRowInsets={{ top: 8, bottom: 8, leading: 16, trailing: 16 }}
      onTapGesture={() => props.onOpen?.()}
    >
      <HStack alignment="top">
        <VStack alignment="leading" spacing={4}>
          <HStack spacing={6}>
            <ProviderLogo provider={props.card.provider} size={16} />
            <Text font={17} fontWeight="semibold">
              {meta.title}
            </Text>
            <PlanBadge
              provider={props.card.provider}
              label={props.card.planLabel || meta.title}
              size="regular"
            />
          </HStack>
          <Text font={15} foregroundStyle="secondaryLabel" lineLimit={1}>
            {props.card.title}
          </Text>
        </VStack>
        <Spacer />
        <Button
          title={refreshTitle}
          systemImage={
            props.card.refreshing
              ? "arrow.triangle.2.circlepath"
              : props.card.refreshStatus === "success"
                ? "checkmark"
                : props.card.refreshStatus === "failure"
                  ? "exclamationmark.triangle"
                  : "arrow.clockwise"
          }
          labelStyle="iconOnly"
          action={props.onRefresh}
          buttonStyle="glass"
          disabled={props.card.refreshing}
          frame={{ width: 44, height: 44 }}
        />
      </HStack>

      {props.card.resetCredits ? (
        <HStack frame={{ maxWidth: "infinity" }}>
          <Button
            buttonStyle="plain"
            action={() => showResetCreditsDetail(props.card.resetCredits!)}
          >
            <HStack spacing={5} contentShape="rect">
              <Image
                systemName="arrow.counterclockwise.circle"
                font={12}
                foregroundStyle="secondaryLabel"
              />
              <Text font={13} foregroundStyle="secondaryLabel">
                可用重置 {props.card.resetCredits.available} 次
              </Text>
              <Image
                systemName="chevron.right"
                font={9}
                foregroundStyle="tertiaryLabel"
              />
            </HStack>
          </Button>
          <Spacer minLength={12} />
          {props.card.resetCredits.nearestExpiration ? (
            <Text
              font={13}
              foregroundStyle="secondaryLabel"
              lineLimit={1}
              monospacedDigit
            >
              最近到期{" "}
              {formatResetDate(props.card.resetCredits.nearestExpiration)}
            </Text>
          ) : (
            <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
              到期时间未知
            </Text>
          )}
        </HStack>
      ) : null}

      {props.card.windows.length === 0 ? (
        <Text font={13} foregroundStyle="secondaryLabel">
          {props.card.authorized ? "暂无用量窗口" : "尚未授权"}
        </Text>
      ) : (
        props.card.windows.map((window) => {
          const value =
            props.displayMode === "remaining"
              ? window.remainingPercent
              : window.usedPercent;
          return (
            <VStack key={window.id} alignment="leading" spacing={6}>
              <HStack>
                <Text font={15} fontWeight="medium">
                  {window.label}
                </Text>
                <Spacer />
                <Text font={15} fontWeight="medium" monospacedDigit>
                  {percentLabel} {formatPercent(value)}
                </Text>
              </HStack>
              <HStack spacing={4}>
                <Image
                  systemName="timer"
                  font={10}
                  foregroundStyle="secondaryLabel"
                />
                <Text
                  font={12}
                  foregroundStyle="secondaryLabel"
                  monospacedDigit
                >
                  {formatRelativeResetAt(window.resetAt)}
                </Text>
              </HStack>
              {value == null ? (
                <Text font={12} foregroundStyle="secondaryLabel">
                  暂无进度
                </Text>
              ) : (
                <ProgressView
                  value={Math.max(0, Math.min(100, value))}
                  total={100}
                  progressViewStyle="linear"
                  tint={usageTint(window.usedPercent, window.remainingPercent)}
                  scaleEffect={{ x: 1, y: 1.4 }}
                />
              )}
            </VStack>
          );
        })
      )}

      <VStack spacing={6}>
        <Divider />
        <Text
          font={12}
          foregroundStyle={footer.color}
          lineLimit={2}
          multilineTextAlignment="center"
          frame={{ maxWidth: "infinity" }}
        >
          {footer.text}
        </Text>
      </VStack>
    </VStack>
  );
}
