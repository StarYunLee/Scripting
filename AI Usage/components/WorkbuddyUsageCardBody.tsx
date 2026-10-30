import {
  Divider,
  HStack,
  Image,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from "scripting";
import type { DisplayMode, UsageCard, UsageWindowView } from "../models";
import { usageTint } from "../services/usage-colors";
import { formatCredits } from "../providers/workbuddy/format";
import { checkinView } from "../providers/workbuddy/checkin-view";
import { formatPercent, formatResetDate } from "../services/usage-format";

/**
 * 信息行统一栅格：图标占固定宽度槽位（leading 对齐），文字块紧贴图标，
 * 金额/日期由 Spacer 推到行尾。这样每行的「图标 + 文字块」整体从最左开始，
 * 且各行文字块起始列一致。
 */
const INFO_ROW_ICON_SLOT = 20;
const INFO_ROW_SPACING = 8;

function byId(card: UsageCard, id: string): UsageWindowView | null {
  return card.windows.find((window) => window.id === id) || null;
}

function creditAmounts(detail: string | null | undefined): {
  used: number;
  total: number;
  remaining: number;
} | null {
  const text = (detail || "").replace(/积分/g, "").trim();
  const [usedRaw, totalRaw] = text.split("/").map((part) => part.trim());
  const used = Number(usedRaw);
  const total = Number(totalRaw);
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return { used, total, remaining: Math.max(0, total - used) };
}


export function WorkbuddyUsageCardBody(props: {
  card: UsageCard;
  displayMode: DisplayMode;
}) {
  const credits = byId(props.card, "workbuddy:credits");
  const checkin = byId(props.card, "workbuddy:checkin");
  const prepaid = byId(props.card, "workbuddy:prepaid");
  const expiring = byId(props.card, "workbuddy:expiring");
  const creditValue =
    props.displayMode === "remaining"
      ? credits?.remainingPercent
      : credits?.usedPercent;
  const creditLabel = props.displayMode === "remaining" ? "剩余" : "已用";
  const amounts = creditAmounts(credits?.detail);
  const checkinInfo = checkinView(checkin?.detail);
  const hasList = Boolean(prepaid || expiring);

  return (
    <VStack alignment="leading" spacing={0}>
      {credits ? (
        <VStack alignment="leading" spacing={0}>
          <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
            <Text
              font={15}
              fontWeight="medium"
              lineLimit={1}
              minScaleFactor={0.7}
              monospacedDigit
            >
              {amounts
                ? `${formatCredits(
                    props.displayMode === "remaining" ? amounts.remaining : amounts.used,
                  )} / ${formatCredits(amounts.total)} 积分`
                : "—"}
            </Text>
            <Spacer minLength={0} />
            <Text
              font={15}
              fontWeight="medium"
              lineLimit={1}
              monospacedDigit
            >
              {creditLabel} {formatPercent(creditValue)}
            </Text>
          </HStack>

          <HStack spacing={4} padding={{ top: 6 }}>
            <Image systemName="timer" font={10} foregroundStyle="secondaryLabel" />
            <Text
              font={12}
              foregroundStyle="secondaryLabel"
              lineLimit={1}
              monospacedDigit
            >
              {credits?.resetAt
                ? `${formatResetDate(credits.resetAt)} 重置`
                : "重置时间未知"}
            </Text>
          </HStack>

          <ProgressView
            value={Math.max(0, Math.min(100, creditValue ?? 0))}
            total={100}
            progressViewStyle="linear"
            tint={usageTint(credits?.usedPercent, credits?.remainingPercent)}
            scaleEffect={{ x: 1, y: 1.35 }}
            padding={{ top: 6 }}
          />
        </VStack>
      ) : (
        <Text font={13} foregroundStyle="secondaryLabel">暂无套餐积分额度</Text>
      )}

      {checkin ? (
        <VStack alignment="leading" spacing={0}>
          {credits ? <Divider padding={{ top: 10 }} /> : null}

          <HStack spacing={INFO_ROW_SPACING} padding={{ top: 8 }}>
            <Image
              systemName={
                checkinInfo.state === "signed"
                  ? "checkmark.circle.fill"
                  : checkinInfo.state === "failed"
                    ? "exclamationmark.triangle.fill"
                    : checkinInfo.state === "unavailable"
                      ? "minus.circle"
                      : "circle"
              }
              font={13}
              foregroundStyle={
                checkinInfo.state === "signed"
                  ? "systemGreen"
                  : checkinInfo.state === "failed"
                    ? "systemOrange"
                    : "secondaryLabel"
              }
              frame={{ width: INFO_ROW_ICON_SLOT, alignment: "leading" }}
            />
            <Text font={13} fontWeight="medium" lineLimit={1}>
              {checkinInfo.label}
            </Text>
            <Spacer minLength={INFO_ROW_SPACING} />
            {checkinInfo.amountLabel ? (
              <Text font={13} fontWeight="medium" lineLimit={1} monospacedDigit>
                {checkinInfo.amountLabel}
              </Text>
            ) : null}
          </HStack>
        </VStack>
      ) : null}

      {hasList ? <Divider padding={{ top: 9 }} /> : null}

      {prepaid ? (
        <HStack
          spacing={INFO_ROW_SPACING}
          frame={{ maxWidth: "infinity" }}
          padding={{ top: 8 }}
        >
          <Image
            systemName="creditcard"
            font={14}
            foregroundStyle="secondaryLabel"
            frame={{ width: INFO_ROW_ICON_SLOT, alignment: "leading" }}
          />
          <VStack alignment="leading" spacing={1}>
            <Text font={12.5} fontWeight="medium">
              预付费积分
            </Text>
            <Text font={10.5} foregroundStyle="secondaryLabel" lineLimit={1}>
              {prepaid.resetAt
                ? `最早 ${formatResetDate(prepaid.resetAt)} 到期 · 无总额`
                : "无总额 · 到期未知"}
            </Text>
          </VStack>
          <Spacer minLength={INFO_ROW_SPACING} />
          <Text
            font={12.5}
            fontWeight="semibold"
            lineLimit={1}
            monospacedDigit
          >
            {prepaid.detail || "—"}
          </Text>
        </HStack>
      ) : null}

      {prepaid && expiring ? (
        <Divider padding={{ top: 7, bottom: 1 }} />
      ) : null}

      {expiring ? (
        <HStack
          spacing={INFO_ROW_SPACING}
          frame={{ maxWidth: "infinity" }}
          padding={{ top: 8 }}
        >
          <Image
            systemName="exclamationmark.triangle"
            font={14}
            foregroundStyle="systemOrange"
            frame={{ width: INFO_ROW_ICON_SLOT, alignment: "leading" }}
          />
          <VStack alignment="leading" spacing={1}>
            <Text font={12.5} fontWeight="medium">
              即将到期
            </Text>
            <Text font={10.5} foregroundStyle="secondaryLabel" lineLimit={1}>
              积分包到期提示
            </Text>
          </VStack>
          <Spacer minLength={INFO_ROW_SPACING} />
          <Text
            font={12}
            lineLimit={1}
            monospacedDigit
            foregroundStyle="secondaryLabel"
          >
            {expiring.detail || "—"}
          </Text>
        </HStack>
      ) : null}
    </VStack>
  );
}
