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
import { normalizeAppWindowLabel } from "../copy/labels";
import {
  formatRelativeFetchedAt,
  formatRelativeResetAt,
  formatPercent,
  formatResetDate,
} from "../services/format";
import { providerMeta, type UsageCard } from "../models";
import { usageTint } from "../services/usage-colors";
import { PlanBadge } from "./PlanBadge";
import { ProviderLogo } from "./ProviderLogo";

const CARD_RADIUS = 20;

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

  const footerSegments: string[] = [];
  let footerColor: "tertiaryLabel" | "systemRed" = "tertiaryLabel";

  if (props.card.errorMessage || props.card.source === "error" || props.card.refreshStatus === "failure") {
    footerColor = "systemRed";
    footerSegments.push(props.card.errorMessage || "刷新失败");
  } else if (props.card.source === "live") {
    footerSegments.push("在线数据");
  } else if (props.card.source === "cache") {
    footerSegments.push("缓存数据");
  } else {
    footerSegments.push("暂无数据");
  }

  if (props.card.fetchedAt) {
    footerSegments.push(formatRelativeFetchedAt(props.card.fetchedAt));
  }

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
      listRowBackground={<></>}
      listRowSeparator="hidden"
      listRowInsets={{ top: 8, bottom: 8, leading: 16, trailing: 16 }}
      onTapGesture={() => props.onOpen?.()}
    >
      <HStack alignment="top">
        <VStack alignment="leading" spacing={4}>
          <HStack spacing={6}>
            <ProviderLogo provider={props.card.provider} size={16} />
            <Text font="headline" fontWeight="semibold">
              {meta.title}
            </Text>
            <PlanBadge
              provider={props.card.provider}
              label={props.card.planLabel || meta.title}
            />
          </HStack>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {props.card.title}
          </Text>
        </VStack>
        <Spacer />
        <HStack spacing={8} alignment="center">
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
          <Image
            systemName="chevron.right"
            foregroundStyle="tertiaryLabel"
            font="body"
            fontWeight="semibold"
          />
        </HStack>
      </HStack>

      {props.card.resetCredits ? (
        <Text font="footnote" foregroundStyle="secondaryLabel">
          可用重置 {props.card.resetCredits.available} 次
          {props.card.resetCredits.nearestExpiration
            ? ` · 最近到期 ${formatResetDate(props.card.resetCredits.nearestExpiration)}`
            : ""}
        </Text>
      ) : null}

      {props.card.windows.length === 0 ? (
        <Text font="footnote" foregroundStyle="secondaryLabel">
          {props.card.authorized
            ? "暂无用量窗口（或已在应用内用量中隐藏全部条目）"
            : "尚未授权"}
        </Text>
      ) : (
        props.card.windows.map((window) => {
          const value =
            props.displayMode === "remaining"
              ? window.remainingPercent
              : window.usedPercent;
          return (
            <VStack key={window.id} alignment="leading" spacing={6}>
              <HStack alignment="bottom">
                <VStack alignment="leading" spacing={2}>
                  <Text font="subheadline" fontWeight="medium">
                    {normalizeAppWindowLabel(window.label)}
                  </Text>
                  {window.resetAt ? (
                    <Text font="caption2" foregroundStyle="tertiaryLabel">
                      {formatRelativeResetAt(window.resetAt)}
                    </Text>
                  ) : null}
                </VStack>
                <Spacer />
                <HStack spacing={4} alignment="firstTextBaseline">
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {percentLabel}
                  </Text>
                  <Text font="subheadline" fontWeight="semibold" monospacedDigit>
                    {formatPercent(value)}
                  </Text>
                </HStack>
              </HStack>
              {value == null || Number.isNaN(value) ? (
                <Text font="caption" foregroundStyle="secondaryLabel">
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

      <VStack spacing={8} padding={{ top: 4 }}>
        <Divider />
        <Text font="caption" foregroundStyle={footerColor} lineLimit={1}>
          {footerSegments.join(" · ")}
        </Text>
      </VStack>
    </VStack>
  );
}
