import {
  HStack,
  Image,
  ProgressView,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { PlanBadge } from "../../components/PlanBadge";
import { ProviderLogo } from "../../components/ProviderLogo";
import { providerMeta } from "../../models";
import type { WidgetPrivacyPrefs } from "../../services/dashboard-prefs";
import { usageTint } from "../../services/usage-colors";
import type { UsageCard } from "../../models";
import {
  flattenCards,
  groupRowsByAccount,
  privacySubtitle,
  providerShortName,
  remainingLabel,
  ringCenterText,
  ringValue,
  shortWindowLabel,
  widgetDisplaySize,
  widgetLayoutSize,
  type DashboardRow,
} from "./model";

type Props = {
  cards: UsageCard[];
  family: string;
  hasErrors?: boolean;
  privacy?: WidgetPrivacyPrefs;
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

function ErrorHint({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <Image
      systemName="exclamationmark.triangle.fill"
      foregroundStyle={C.warn}
      font={9}
    />
  );
}

function TextRow(props: { row: DashboardRow; privacy: WidgetPrivacyPrefs }) {
  const meta = providerMeta(props.row.provider);
  const subtitle = privacySubtitle(props.row, props.privacy);
  const label = `${providerShortName(props.row.provider)} · ${shortWindowLabel(props.row.windowLabel)}`;
  return (
    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity" }}>
      <HStack alignment="center" spacing={6}>
        <Text
          font={10}
          fontWeight="semibold"
          foregroundStyle={C.primary}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {label}
        </Text>
        <Spacer minLength={0} />
        <Text font={10} fontWeight="bold" monospacedDigit foregroundStyle={C.primary}>
          {remainingLabel(props.row.remainingPercent)}
        </Text>
      </HStack>
      {subtitle ? (
        <Text font={8} foregroundStyle={C.secondary} lineLimit={1} minScaleFactor={0.75}>
          {subtitle}
        </Text>
      ) : props.privacy.showPlanBadge ? (
        <Text font={8} foregroundStyle={C.secondary} lineLimit={1}>
          {props.row.planLabel || meta.title}
        </Text>
      ) : null}
    </VStack>
  );
}

function UsageRing(props: {
  row: DashboardRow;
  size: number;
  privacy: WidgetPrivacyPrefs;
  compact?: boolean;
}) {
  const value = ringValue(props.row.remainingPercent);
  const tint = usageTint(props.row.usedPercent, props.row.remainingPercent);
  const logo = props.compact ? 10 : 12;
  const titleFont = props.compact ? 9 : 10;
  const subFont = props.compact ? 8 : 9;
  const subtitle = privacySubtitle(props.row, props.privacy);

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
      {subtitle ? (
        <Text
          font={subFont}
          foregroundStyle={C.secondary}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {subtitle}
        </Text>
      ) : (
        <Text
          font={subFont}
          foregroundStyle={C.secondary}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {shortWindowLabel(props.row.windowLabel)}
        </Text>
      )}
    </VStack>
  );
}

function BarRow(props: {
  row: DashboardRow;
  width: number;
  privacy: WidgetPrivacyPrefs;
  compact?: boolean;
}) {
  const meta = providerMeta(props.row.provider);
  const subtitle = privacySubtitle(props.row, props.privacy);
  return (
    <VStack alignment="leading" spacing={props.compact ? 4 : 5}>
      <HStack alignment="center" spacing={6}>
        {props.privacy.showPlanBadge ? (
          <PlanBadge
            provider={props.row.provider}
            label={props.row.planLabel || meta.title}
            small
          />
        ) : (
          <ProviderLogo provider={props.row.provider} size={12} />
        )}
        <VStack alignment="leading" spacing={1}>
          <Text
            font={props.compact ? 10 : 11}
            fontWeight="semibold"
            lineLimit={1}
            minScaleFactor={0.8}
          >
            {providerShortName(props.row.provider)} · {props.row.windowLabel}
          </Text>
          {subtitle ? (
            <Text font={8} foregroundStyle={C.secondary} lineLimit={1}>
              {subtitle}
            </Text>
          ) : null}
        </VStack>
        <Spacer minLength={0} />
        <Text
          font={props.compact ? 10 : 11}
          fontWeight="bold"
          monospacedDigit
          foregroundStyle={C.primary}
        >
          剩余 {remainingLabel(props.row.remainingPercent)}
        </Text>
      </HStack>
      <ProgressBar
        value={props.row.remainingPercent}
        usedPercent={props.row.usedPercent}
        remainingPercent={props.row.remainingPercent}
        width={props.width}
        height={props.compact ? 5 : 6}
      />
    </VStack>
  );
}

function RingRow(props: {
  rows: DashboardRow[];
  ringSize: number;
  columns: number;
  privacy: WidgetPrivacyPrefs;
  compact?: boolean;
}) {
  const visible = props.rows.slice(0, props.columns);
  return (
    <HStack alignment="top" spacing={props.compact ? 6 : 8}>
      {visible.map((row) => (
        <UsageRing
          key={row.key}
          row={row}
          size={props.ringSize}
          privacy={props.privacy}
          compact={props.compact}
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

function SmallTextLayout(props: {
  rows: DashboardRow[];
  hasErrors?: boolean;
  privacy: WidgetPrivacyPrefs;
}) {
  const visible = props.rows.slice(0, 5);
  const hidden = props.rows.length - visible.length;
  return (
    <VStack
      alignment="leading"
      spacing={8}
      padding={12}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack alignment="center">
        <Text font={12} fontWeight="bold">
          总用量
        </Text>
        <Spacer minLength={0} />
        <ErrorHint show={props.hasErrors} />
      </HStack>
      <VStack alignment="leading" spacing={7}>
        {visible.map((row) => (
          <TextRow key={row.key} row={row} privacy={props.privacy} />
        ))}
      </VStack>
      {hidden > 0 ? (
        <Text font={8} foregroundStyle={C.secondary}>
          +{hidden} 条
        </Text>
      ) : null}
      <Spacer minLength={0} />
    </VStack>
  );
}

function MediumRingLayout(props: {
  rows: DashboardRow[];
  width: number;
  hasErrors?: boolean;
  privacy: WidgetPrivacyPrefs;
}) {
  const columns = Math.min(5, props.rows.length);
  const ringSize = Math.max(
    48,
    Math.floor((props.width - 24 - (columns - 1) * 10) / columns),
  );
  const hidden = props.rows.length - columns;
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
        rows={props.rows}
        ringSize={ringSize}
        columns={columns}
        privacy={props.privacy}
      />
      {hidden > 0 ? (
        <Text font={9} foregroundStyle={C.secondary} padding={{ top: 8 }}>
          另有 {hidden} 条 · 可换大尺寸查看详情
        </Text>
      ) : (
        <HStack padding={{ top: 6 }}>
          <ErrorHint show={props.hasErrors} />
        </HStack>
      )}
      <Spacer minLength={0} />
    </VStack>
  );
}

function LargeBarLayout(props: {
  rows: DashboardRow[];
  width: number;
  hasErrors?: boolean;
  privacy: WidgetPrivacyPrefs;
}) {
  const visible = props.rows.slice(0, 6);
  const hidden = props.rows.length - visible.length;
  const contentWidth = Math.max(220, props.width - 32);
  return (
    <VStack
      alignment="leading"
      spacing={10}
      padding={16}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack alignment="center">
        <Text font={14} fontWeight="bold">
          总用量
        </Text>
        <Spacer minLength={0} />
        <Text font={9} foregroundStyle={C.secondary}>
          {props.rows.length} 条目
        </Text>
        <ErrorHint show={props.hasErrors} />
      </HStack>
      <VStack alignment="leading" spacing={10}>
        {visible.map((row) => (
          <BarRow
            key={row.key}
            row={row}
            width={contentWidth}
            privacy={props.privacy}
            compact
          />
        ))}
      </VStack>
      {hidden > 0 ? (
        <Text font={10} foregroundStyle={C.secondary}>
          另有 {hidden} 条未显示
        </Text>
      ) : null}
      <Spacer minLength={0} />
    </VStack>
  );
}

function ExtraLargeGroupedLayout(props: {
  rows: DashboardRow[];
  width: number;
  hasErrors?: boolean;
  privacy: WidgetPrivacyPrefs;
}) {
  const groups = groupRowsByAccount(props.rows).slice(0, 4);
  const shownRows = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const hidden = props.rows.length - shownRows;
  const contentWidth = Math.max(250, props.width - 40);

  return (
    <VStack
      alignment="leading"
      spacing={12}
      padding={20}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack alignment="center">
        <Text font={16} fontWeight="bold">
          总用量
        </Text>
        <Spacer minLength={0} />
        <Text font={10} foregroundStyle={C.secondary}>
          {groups.length} 账号 · {props.rows.length} 条目
        </Text>
        <ErrorHint show={props.hasErrors} />
      </HStack>

      <VStack alignment="leading" spacing={14}>
        {groups.map((group) => {
          const meta = providerMeta(group.provider);
          const subtitle = privacySubtitle(group, props.privacy);
          const visibleRows = group.rows.slice(0, 3);
          const extra = group.rows.length - visibleRows.length;
          return (
            <VStack key={group.accountKey} alignment="leading" spacing={8}>
              <HStack alignment="center" spacing={8}>
                {props.privacy.showPlanBadge ? (
                  <PlanBadge
                    provider={group.provider}
                    label={group.planLabel || meta.title}
                  />
                ) : (
                  <ProviderLogo provider={group.provider} size={16} />
                )}
                <VStack alignment="leading" spacing={2}>
                  <Text font={13} fontWeight="semibold" lineLimit={1}>
                    {providerShortName(group.provider)}
                  </Text>
                  {subtitle ? (
                    <Text font={10} foregroundStyle={C.secondary} lineLimit={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>
              <VStack alignment="leading" spacing={8}>
                {visibleRows.map((row) => (
                  <BarRow
                    key={row.key}
                    row={row}
                    width={contentWidth}
                    privacy={props.privacy}
                  />
                ))}
              </VStack>
              {extra > 0 ? (
                <Text font={9} foregroundStyle={C.secondary}>
                  该账号另有 {extra} 条未显示
                </Text>
              ) : null}
            </VStack>
          );
        })}
      </VStack>

      {hidden > 0 ? (
        <Text font={10} foregroundStyle={C.secondary}>
          另有 {hidden} 条未显示
        </Text>
      ) : null}
      <Spacer minLength={0} />
    </VStack>
  );
}

export function DashboardWidgetView(props: Props) {
  const privacy = props.privacy || {
    showAccountEmail: false,
    showAccountId: false,
    showPlanBadge: true,
  };
  const rows = flattenCards(props.cards);
  const layout = widgetLayoutSize(props.family);
  const display = widgetDisplaySize(props.family);
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

  if (layout === "small") {
    return (
      <SmallTextLayout
        rows={rows}
        hasErrors={props.hasErrors}
        privacy={privacy}
      />
    );
  }

  if (layout === "medium") {
    return (
      <MediumRingLayout
        rows={rows}
        width={display.width}
        hasErrors={props.hasErrors}
        privacy={privacy}
      />
    );
  }

  if (layout === "large") {
    return (
      <LargeBarLayout
        rows={rows}
        width={display.width}
        hasErrors={props.hasErrors}
        privacy={privacy}
      />
    );
  }

  return (
    <ExtraLargeGroupedLayout
      rows={rows}
      width={display.width}
      hasErrors={props.hasErrors}
      privacy={privacy}
    />
  );
}
