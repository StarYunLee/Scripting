import {
  HStack,
  Image,
  Script,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "scripting";
import type { ProviderId, UsageWindowView } from "../models";
import { PlanBadge } from "../components/PlanBadge";
import { WidgetProgress } from "./WidgetProgress";
import { isWidgetTransparent, widgetTheme as C } from "./transparent";
import {
  formatPercent,
  formatRelativeResetAt,
} from "../services/usage-format";
import { formatCredits } from "../providers/workbuddy/format";
import type { WidgetChromeStyle } from "./chrome-style";
import { checkinView } from "../providers/workbuddy/checkin-view";

export type WorkbuddyLayoutProps = {
  width: number;
  provider: ProviderId;
  planLabel: string;
  watermarkPath: string;
  windows: UsageWindowView[];
  fetchedText: string;
  errorText?: string;
  chromeStyle?: WidgetChromeStyle;
};

function Watermark(props: { path: string }) {
  if (isWidgetTransparent()) return null;
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

function byId(
  windows: UsageWindowView[],
  id: string,
): UsageWindowView | null {
  return windows.find((window) => window.id === id) || null;
}

function creditParts(detail: string | null | undefined): {
  used: string;
  remaining: string;
  total: string;
} | null {
  const text = (detail || "").replace(/积分/g, "").trim();
  const [usedRaw, totalRaw] = text.split("/").map((part) => part.trim());
  const used = Number(usedRaw);
  const total = Number(totalRaw);
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return {
    used: formatCredits(used),
    remaining: formatCredits(Math.max(0, total - used)),
    total: formatCredits(total),
  };
}

export function WorkbuddyMediumLayout(props: WorkbuddyLayoutProps) {
  const credits = byId(props.windows, "workbuddy:credits");
  const checkin = byId(props.windows, "workbuddy:checkin");
  const contentWidth = Math.max(180, props.width - 40);
  const creditPercent = formatPercent(credits?.remainingPercent);
  const parts = creditParts(credits?.detail);
  const checkinInfo = checkinView(checkin?.detail);
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

      <VStack
        alignment="leading"
        spacing={0}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 12, bottom: 0 }}
      >
        <HStack frame={{ maxWidth: "infinity" }} alignment="center">
          <PlanBadge
            provider={props.provider}
            label={props.planLabel}
            size="widget"
            chromeStyle={props.chromeStyle}
          />
          <Spacer />
          <Text
            font={10}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            {...(shadow ? { shadow } : {})}
          >
            {props.fetchedText}
          </Text>
        </HStack>

        <Text
          font={16}
          fontWeight="semibold"
          foregroundStyle={C.primary}
          lineLimit={1}
          padding={{ top: 6 }}
          {...(shadow ? { shadow } : {})}
        >
          {credits?.label || "暂无套餐额度"}
        </Text>

        <HStack
          alignment="lastTextBaseline"
          spacing={4}
          frame={{ maxWidth: "infinity" }}
          padding={{ top: 0 }}
        >
          <Text
            font={32}
            fontWeight="bold"
            foregroundStyle={C.primary}
            lineLimit={1}
            monospacedDigit
            {...(shadow ? { shadow } : {})}
          >
            {creditPercent}
          </Text>
          <Text
            font={12}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            {...(shadow ? { shadow } : {})}
          >
            剩余
          </Text>
          <Spacer minLength={8} />
          <Text
            font={12}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            {...(shadow ? { shadow } : {})}
          >
            {formatRelativeResetAt(credits?.resetAt)}
          </Text>
        </HStack>

        <HStack padding={{ top: 2 }}>
          <WidgetProgress
            usedPercent={credits?.usedPercent}
            remainingPercent={credits?.remainingPercent}
            width={contentWidth}
            height={6.5}
            chromeStyle={props.chromeStyle}
          />
        </HStack>

        <HStack frame={{ maxWidth: "infinity" }} padding={{ top: 7 }}>
          <Text
            font={12}
            fontWeight="semibold"
            foregroundStyle={C.primary}
            lineLimit={1}
            monospacedDigit
            {...(shadow ? { shadow } : {})}
          >
            {parts ? `剩余 ${parts.remaining}` : "—"}
          </Text>
          <Spacer />
          <Text
            font={12}
            fontWeight="semibold"
            foregroundStyle={C.primary}
            lineLimit={1}
            monospacedDigit
            {...(shadow ? { shadow } : {})}
          >
            {parts ? `总积分 ${parts.total}` : "—"}
          </Text>
        </HStack>

        <HStack
          frame={{ maxWidth: "infinity", height: 1 }}
          background={C.divider}
          padding={{ top: 3 }}
        />

        <HStack spacing={7} padding={{ top: 3 }}>
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
            font={12}
            foregroundStyle={
              checkinInfo.state === "signed"
                ? C.accent
                : checkinInfo.state === "failed"
                  ? C.warn
                  : C.secondary
            }
          />
          <Text
            font={12.5}
            fontWeight="medium"
            foregroundStyle={C.primary}
            lineLimit={1}
            {...(shadow ? { shadow } : {})}
          >
            {checkinInfo.label}
          </Text>
          <Spacer minLength={8} />
          {checkinInfo.amountLabel ? (
            <Text
              font={12.5}
              fontWeight="medium"
              foregroundStyle={C.primary}
              lineLimit={1}
              monospacedDigit
              {...(shadow ? { shadow } : {})}
            >
              {checkinInfo.amountLabel}
            </Text>
          ) : null}
        </HStack>

        {props.errorText ? (
          <Text
            font={8}
            foregroundStyle={C.warn}
            lineLimit={1}
            padding={{ top: 4 }}
          >
            {props.errorText}
          </Text>
        ) : null}
      </VStack>
    </ZStack>
  );
}
