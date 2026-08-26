import {
  Button,
  Divider,
  HStack,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from "scripting";
import {
  formatFetchedAt,
  formatPercent,
  formatResetDate,
} from "../providers/codex/format";
import { providerMeta, type UsageCard } from "../models";
import { usageTint } from "../services/usage-colors";
import { PlanBadge } from "./PlanBadge";

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
        <VStack alignment="leading" spacing={8}>
          <Text font={17} fontWeight="semibold">
            {props.card.title}
          </Text>
          <HStack spacing={6}>
            <PlanBadge
              provider={props.card.provider}
              label={props.card.planLabel || meta.title}
            />
          </HStack>
        </VStack>
        <Spacer />
        <Button
          title={refreshTitle}
          action={props.onRefresh}
          buttonStyle="glass"
        />
      </HStack>

      {props.card.resetCredits ? (
        <Text font={13} foregroundStyle="secondaryLabel">
          重置次数 {props.card.resetCredits.available} 次
          {props.card.resetCredits.nearestExpiration
            ? ` · 最近到期 ${formatResetDate(props.card.resetCredits.nearestExpiration)}`
            : ""}
        </Text>
      ) : null}

      {props.card.errorMessage ? (
        <Text font={13} foregroundStyle="systemRed">
          {props.card.errorMessage}
        </Text>
      ) : null}

          {props.card.windows.length === 0 ? (
        <Text font={13} foregroundStyle="secondaryLabel">
          {props.card.authorized
            ? "暂无用量窗口（或已在总览中隐藏全部条目）"
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
              <HStack>
                <Text font={15}>{window.label}</Text>
                <Spacer />
                <Text font={15} fontWeight="medium" monospacedDigit>
                  {percentLabel} {formatPercent(value)}
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
              <Text font={12} foregroundStyle="secondaryLabel">
                重置 {formatResetDate(window.resetAt)}
              </Text>
            </VStack>
          );
        })
      )}

      <VStack spacing={6}>
        <Divider />
        <HStack>
          <Text font={12} foregroundStyle="tertiaryLabel">
            更新 {formatFetchedAt(props.card.fetchedAt)}
          </Text>
          <Spacer />
          {props.card.source === "live" ? (
            <Text font={12} foregroundStyle="tertiaryLabel">
              实时
            </Text>
          ) : props.card.source === "cache" ? (
            <Text font={12} foregroundStyle="tertiaryLabel">
              缓存
            </Text>
          ) : props.card.source === "error" ? (
            <Text font={12} foregroundStyle="systemRed">
              刷新失败
            </Text>
          ) : (
            <Text font={12} foregroundStyle="tertiaryLabel">
              暂无数据
            </Text>
          )}
        </HStack>
      </VStack>
    </VStack>
  );
}
