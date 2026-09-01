import { HStack, Image, Spacer, Text, VStack, ZStack } from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import { PlanBadge } from "../../components/PlanBadge";
import { formatResetCountdown } from "../../services/usage-format";
import { parseWidgetFamily } from "../family";
import { providerMeta, type UsageWindowView } from "../../models";
import { usageTint } from "../../services/usage-colors";
import {
  readDashboardWidgetPreferences,
  type DashboardWidgetDisplayPreferences,
} from "../../services/dashboard-widget-prefs";
import {
  planDashboard,
  type DashboardAccount,
  type DashboardPlan,
} from "./model";

const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
  light,
  dark,
});
const C = {
  bg: "systemBackground" as Color,
  primary: "label" as Color,
  secondary: "secondaryLabel" as Color,
  divider: dynamic("rgba(60,60,67,0.12)", "rgba(235,235,245,0.16)"),
  track: dynamic("#C7C8CC", "#55565C"),
  warn: "systemOrange" as Color,
};

function percent(value: number | null): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value)}%`;
}

function Progress(props: { window: UsageWindowView; width: number }) {
  const value =
    props.window.remainingPercent == null
      ? 0
      : Math.max(0, Math.min(100, props.window.remainingPercent));
  const fill = (props.width * value) / 100;
  return (
    <ZStack alignment="leading" frame={{ width: props.width, height: 4 }}>
      <HStack
        frame={{ width: props.width, height: 4 }}
        background={C.track}
        clipShape={{ type: "capsule", style: "continuous" }}
      />
      {fill > 0 ? (
        <HStack
          frame={{ width: Math.max(4, fill), height: 4 }}
          background={usageTint(
            props.window.usedPercent,
            props.window.remainingPercent,
          )}
          clipShape={{ type: "capsule", style: "continuous" }}
        />
      ) : null}
    </ZStack>
  );
}

function WindowRow(props: {
  window: UsageWindowView;
  width: number;
  compact: boolean;
}) {
  const countdown = formatResetCountdown(props.window.resetAt);
  return (
    <VStack alignment="leading" spacing={props.compact ? 2 : 3}>
      <HStack spacing={4} frame={{ width: props.width }}>
        <Text
          font={11}
          fontWeight="semibold"
          foregroundStyle={C.secondary}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {props.window.label}
        </Text>
        <Spacer minLength={0} />
        {countdown ? (
          <Text
            font={10}
            fontWeight="medium"
            monospacedDigit
            foregroundStyle={C.secondary}
            layoutPriority={1}
          >
            {countdown}
          </Text>
        ) : null}
        <Text
          font={10}
          fontWeight="semibold"
          monospacedDigit
          foregroundStyle={C.primary}
          layoutPriority={1}
        >
          {percent(props.window.remainingPercent)}
        </Text>
      </HStack>
      <Progress window={props.window} width={props.width} />
    </VStack>
  );
}

function AccountCell(props: {
  account: DashboardAccount;
  width: number;
  compact: boolean;
  display: DashboardWidgetDisplayPreferences;
}) {
  const meta = providerMeta(props.account.provider);
  const windows = props.account.windows.slice(0, 2);
  return (
    <VStack
      alignment="leading"
      spacing={props.compact ? 3 : 7}
      frame={{ width: props.width }}
    >
      <HStack spacing={5} frame={{ width: props.width }}>
        <PlanBadge
          provider={props.account.provider}
          label={props.account.planLabel || meta.title}
          size="widget-dense"
        />
        <Spacer minLength={0} />
        {props.display.showAccountLabel ? (
          <Text
            font={10}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            truncationMode="tail"
            minScaleFactor={0.85}
            layoutPriority={0}
          >
            {props.account.accountTitle}
          </Text>
        ) : null}
        {props.account.source === "error" ? (
          <Image
            systemName="exclamationmark.triangle.fill"
            font={8}
            foregroundStyle={C.warn}
          />
        ) : null}
      </HStack>
      {windows.map((window) => (
        <WindowRow
          key={window.id}
          window={window}
          width={props.width}
          compact={props.compact}
        />
      ))}
    </VStack>
  );
}

function latestCommonRefreshText(accounts: DashboardAccount[]): string {
  const times = accounts
    .map((account) =>
      account.fetchedAt ? new Date(account.fetchedAt).getTime() : NaN,
    )
    .filter((value) => Number.isFinite(value));
  if (!times.length) return "暂无刷新时间";
  const date = new Date(Math.min(...times));
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute} 刷新`;
}

function EmptyDashboard(props: { message: string }) {
  return (
    <VStack
      alignment="center"
      spacing={8}
      padding={16}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <Image
        systemName="square.grid.2x2.fill"
        font={22}
        foregroundStyle={C.secondary}
      />
      <Spacer />
      <Text font={14} fontWeight="bold">
        AI Usage
      </Text>
      <Text
        font={10}
        foregroundStyle={C.secondary}
        multilineTextAlignment="center"
      >
        {props.message}
      </Text>
    </VStack>
  );
}

function DashboardFooter(props: {
  hiddenAccountCount: number;
  hasErrors?: boolean;
  refreshText: string;
}) {
  return (
    <HStack frame={{ maxWidth: "infinity" }}>
      <Text font={9} foregroundStyle={C.secondary}>
        {props.hiddenAccountCount > 0
          ? `另有 ${props.hiddenAccountCount} 个账号`
          : ""}
      </Text>
      <Spacer minLength={0} />
      {props.hasErrors ? (
        <Image
          systemName="exclamationmark.triangle.fill"
          font={8}
          foregroundStyle={C.warn}
        />
      ) : null}
      <Text font={9} foregroundStyle={C.secondary}>
        {props.refreshText}
      </Text>
    </HStack>
  );
}

function SmallDashboard(props: {
  plan: DashboardPlan;
  width: number;
  hasErrors?: boolean;
  display: DashboardWidgetDisplayPreferences;
}) {
  const padding = 12;
  const contentWidth = props.width - padding * 2;
  const accounts = props.plan.accounts.slice(0, 2);
  return (
    <VStack
      alignment="leading"
      spacing={4}
      padding={{ horizontal: padding, vertical: 12 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      {accounts.map((account, index) => (
        <VStack key={account.key} spacing={4} frame={{ maxWidth: "infinity" }}>
          {index > 0 ? (
            <HStack
              frame={{ maxWidth: "infinity", height: 1 }}
              background={C.divider}
            />
          ) : null}
          <AccountCell
            account={account}
            width={contentWidth}
            compact={true}
            display={props.display}
          />
        </VStack>
      ))}
      <Spacer minLength={0} />
      <DashboardFooter
        hiddenAccountCount={props.plan.hiddenAccountCount}
        hasErrors={props.hasErrors}
        refreshText={latestCommonRefreshText(accounts)}
      />
    </VStack>
  );
}

/** Medium 保留原有两行网格容器；Small 的单列改动不能改变它的垂直坐标。 */
function MediumDashboard(props: {
  plan: DashboardPlan;
  width: number;
  hasErrors?: boolean;
  display: DashboardWidgetDisplayPreferences;
}) {
  const padding = 14;
  const columnGap = 18;
  const cellWidth =
    props.plan.columns === 1
      ? props.width - padding * 2
      : (props.width - padding * 2 - columnGap) / 2;
  const firstRow = props.plan.accounts.slice(0, props.plan.columns);
  const secondRow =
    props.plan.rows === 2
      ? props.plan.accounts.slice(props.plan.columns, 4)
      : [];
  const compact = props.plan.rows === 2;
  const refreshText = latestCommonRefreshText(props.plan.accounts);
  const row = (accounts: DashboardAccount[], key: string) => (
    <HStack key={key} spacing={columnGap} frame={{ maxWidth: "infinity" }}>
      {accounts.map((account) => (
        <AccountCell
          key={account.key}
          account={account}
          width={cellWidth}
          compact={compact}
          display={props.display}
        />
      ))}
      {accounts.length < props.plan.columns ? <Spacer minLength={0} /> : null}
    </HStack>
  );

  return (
    <VStack
      alignment="leading"
      spacing={compact ? 3 : 9}
      padding={{ horizontal: padding, vertical: compact ? 5 : 10 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      {row(firstRow, "first")}
      {secondRow.length > 0 ? (
        <HStack
          frame={{ maxWidth: "infinity", height: 1 }}
          background={C.divider}
        />
      ) : null}
      {secondRow.length > 0 ? row(secondRow, "second") : null}
      <DashboardFooter
        hiddenAccountCount={props.plan.hiddenAccountCount}
        hasErrors={props.hasErrors}
        refreshText={refreshText}
      />
    </VStack>
  );
}

function LargeDashboard(props: {
  plan: DashboardPlan;
  width: number;
  hasErrors?: boolean;
  display: DashboardWidgetDisplayPreferences;
}) {
  const padding = 16;
  const columnGap = 20;
  const cellWidth = (props.width - padding * 2 - columnGap) / 2;
  const rows: DashboardAccount[][] = [];
  for (let i = 0; i < props.plan.accounts.length; i += 2) {
    rows.push(props.plan.accounts.slice(i, i + 2));
  }
  const refreshText = latestCommonRefreshText(props.plan.accounts);
  const visibleAccountCount = props.plan.accounts.length;
  const totalAccountCount = visibleAccountCount + props.plan.hiddenAccountCount;
  const accountSummary =
    props.plan.hiddenAccountCount > 0
      ? `显示 ${visibleAccountCount} / 共 ${totalAccountCount} 个账号`
      : `${visibleAccountCount} 个账号`;

  return (
    <VStack
      alignment="leading"
      spacing={7}
      padding={{ horizontal: padding, vertical: 9 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack frame={{ maxWidth: "infinity" }}>
        <Text font={13} fontWeight="bold">
          AI Usage
        </Text>
        <Spacer minLength={0} />
        <Text font={9} foregroundStyle={C.secondary} monospacedDigit>
          {accountSummary}
        </Text>
      </HStack>
      {rows.map((accounts, index) => (
        <VStack
          key={`large-${index}`}
          spacing={6}
          frame={{ maxWidth: "infinity" }}
        >
          {index > 0 ? (
            <HStack
              frame={{ maxWidth: "infinity", height: 1 }}
              background={C.divider}
            />
          ) : null}
          <HStack spacing={columnGap} frame={{ maxWidth: "infinity" }}>
            {accounts.map((account) => (
              <AccountCell
                key={account.key}
                account={account}
                width={cellWidth}
                compact={true}
                display={props.display}
              />
            ))}
            {accounts.length < 2 ? <Spacer minLength={0} /> : null}
          </HStack>
        </VStack>
      ))}
      <HStack frame={{ maxWidth: "infinity" }}>
        <Spacer minLength={0} />
        {props.hasErrors ? (
          <Image
            systemName="exclamationmark.triangle.fill"
            font={8}
            foregroundStyle={C.warn}
          />
        ) : null}
        <Text font={9} foregroundStyle={C.secondary}>
          {refreshText}
        </Text>
      </HStack>
    </VStack>
  );
}

type SparseLargeSlot = {
  account: DashboardAccount;
  placeholder: boolean;
};

function placeholderLargeAccount(index: number): DashboardAccount {
  return {
    key: `large-placeholder-${index}`,
    provider: "codex",
    accountId: `large-placeholder-${index}`,
    accountTitle: "placeholder@example.invalid",
    planLabel: "Plus",
    fetchedAt: null,
    windows: [
      {
        id: `large-placeholder-${index}-primary`,
        label: "5 小时",
        usedPercent: 50,
        remainingPercent: 50,
        resetAt: null,
      },
      {
        id: `large-placeholder-${index}-secondary`,
        label: "每周",
        usedPercent: 50,
        remainingPercent: 50,
        resetAt: null,
      },
    ],
    source: "cache",
  };
}

function SparseLargeDashboard(props: {
  plan: DashboardPlan;
  width: number;
  hasErrors?: boolean;
  display: DashboardWidgetDisplayPreferences;
}) {
  const padding = 16;
  const columnGap = 20;
  const cellWidth = (props.width - padding * 2 - columnGap) / 2;
  const slots: SparseLargeSlot[] = Array.from({ length: 8 }, (_, index) => {
    const account = props.plan.accounts[index];
    return account
      ? { account, placeholder: false }
      : { account: placeholderLargeAccount(index), placeholder: true };
  });
  const rows = [
    slots.slice(0, 2),
    slots.slice(2, 4),
    slots.slice(4, 6),
    slots.slice(6, 8),
  ];
  const refreshText = latestCommonRefreshText(props.plan.accounts);
  const visibleAccountCount = props.plan.accounts.length;
  const totalAccountCount = visibleAccountCount + props.plan.hiddenAccountCount;
  const accountSummary =
    props.plan.hiddenAccountCount > 0
      ? `显示 ${visibleAccountCount} / 共 ${totalAccountCount} 个账号`
      : `${visibleAccountCount} 个账号`;

  return (
    <VStack
      alignment="leading"
      spacing={7}
      padding={{ horizontal: padding, vertical: 9 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack frame={{ maxWidth: "infinity" }}>
        <Text font={13} fontWeight="bold">
          AI Usage
        </Text>
        <Spacer minLength={0} />
        <Text font={9} foregroundStyle={C.secondary} monospacedDigit>
          {accountSummary}
        </Text>
      </HStack>
      {rows.map((slotsInRow, index) => (
        <VStack
          key={`sparse-large-${index}`}
          spacing={6}
          frame={{ maxWidth: "infinity" }}
        >
          {index > 0 ? (
            <HStack
              frame={{ maxWidth: "infinity", height: 1 }}
              background={C.divider}
            />
          ) : null}
          <HStack spacing={columnGap} frame={{ maxWidth: "infinity" }}>
            {slotsInRow.map((slot) =>
              slot.placeholder ? (
                <VStack key={slot.account.key} opacity={0}>
                  <AccountCell
                    account={slot.account}
                    width={cellWidth}
                    compact={true}
                    display={props.display}
                  />
                </VStack>
              ) : (
                <AccountCell
                  key={slot.account.key}
                  account={slot.account}
                  width={cellWidth}
                  compact={true}
                  display={props.display}
                />
              ),
            )}
          </HStack>
        </VStack>
      ))}
      <HStack frame={{ maxWidth: "infinity" }}>
        <Spacer minLength={0} />
        {props.hasErrors ? (
          <Image
            systemName="exclamationmark.triangle.fill"
            font={8}
            foregroundStyle={C.warn}
          />
        ) : null}
        <Text font={9} foregroundStyle={C.secondary}>
          {refreshText}
        </Text>
      </HStack>
    </VStack>
  );
}

export function DashboardWidgetView(props: {
  cards: import("../../models").UsageCard[];
  family: string;
  width: number;
  hasErrors?: boolean;
  display?: DashboardWidgetDisplayPreferences;
}) {
  const family = parseWidgetFamily(props.family);
  const display = props.display || readDashboardWidgetPreferences().display;
  if (!family) {
    return <EmptyDashboard message="暂不支持此小组件尺寸" />;
  }
  const plan = planDashboard(props.cards, family);
  if (!plan.accounts.length) {
    return (
      <EmptyDashboard
        message={
          props.hasErrors
            ? "暂无可显示的额度，请打开 AI Usage 刷新账号用量"
            : "暂无可显示的账号额度"
        }
      />
    );
  }
  if (family === "small") {
    return (
      <SmallDashboard
        plan={plan}
        width={props.width}
        hasErrors={props.hasErrors}
        display={display}
      />
    );
  }
  if (family === "medium") {
    return (
      <MediumDashboard
        plan={plan}
        width={props.width}
        hasErrors={props.hasErrors}
        display={display}
      />
    );
  }
  if (plan.accounts.length < 8) {
    return (
      <SparseLargeDashboard
        plan={plan}
        width={props.width}
        hasErrors={props.hasErrors}
        display={display}
      />
    );
  }
  return (
    <LargeDashboard
      plan={plan}
      width={props.width}
      hasErrors={props.hasErrors}
      display={display}
    />
  );
}
