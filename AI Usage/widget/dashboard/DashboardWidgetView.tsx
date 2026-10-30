import { Button, HStack, Image, Spacer, Text, VStack } from "scripting";
import { RefreshAIUsageAllIntent } from "../../app_intents";
import { DashboardAccountHeader } from "./DashboardAccountHeader";
import { formatResetCountdown } from "../../services/usage-format";
import { parseWidgetFamily } from "../family";
import { providerMeta, type ProviderId, type UsageWindowView } from "../../models";
import { WidgetProgress } from "../WidgetProgress";
import { DeepseekDashboardBalanceRow } from "../deepseek-layouts";
import type { WidgetChromeStyle } from "../chrome-style";
import { widgetTheme as C } from "../transparent";
import { workbuddyDashboardCredits } from "./workbuddy-credits";
import { dashboardWindowTitle } from "./window-titles";
import {
  readDashboardWidgetPreferences,
  type DashboardWidgetDisplayPreferences,
} from "../../services/dashboard-widget-prefs";
import {
  planDashboard,
  type DashboardAccount,
  type DashboardPlan,
} from "./model";

// Match the body area of two quota rows; the badge/account header stays outside it.
const TWO_WINDOW_CONTENT_HEIGHT = { compact: 43, regular: 49 } as const;

function percent(value: number | null): string {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value)}%`;
}

function Progress(props: {
  window: UsageWindowView;
  width: number;
  chromeStyle?: WidgetChromeStyle;
}) {
  return (
    <WidgetProgress
      usedPercent={props.window.usedPercent}
      remainingPercent={props.window.remainingPercent}
      width={props.width}
      height={4}
      chromeStyle={props.chromeStyle}
    />
  );
}

function WindowRow(props: {
  provider: ProviderId;
  window: UsageWindowView;
  width: number;
  compact: boolean;
  chromeStyle?: WidgetChromeStyle;
  errorText?: string;
}) {
  if (props.provider === "deepseek") {
    return <DeepseekDashboardBalanceRow
      window={props.window}
      width={props.width}
      compact={props.compact}
      chromeStyle={props.chromeStyle}
      errorText={props.errorText}
    />;
  }
  const countdown = formatResetCountdown(props.window.resetAt);
  const shadow = C.textShadow;
  const workbuddyCredits =
    props.provider === "workbuddy" && props.window.id === "workbuddy:credits";
  const workbuddyParts = workbuddyCredits
    ? workbuddyDashboardCredits(props.window.detail)
    : null;
  return (
    <VStack alignment="leading" spacing={workbuddyCredits ? (props.compact ? 6 : 9) : (props.compact ? 2 : 3)}>
      <HStack spacing={4} frame={{ width: props.width }}>
        <Text
          font={11}
          fontWeight="semibold"
          foregroundStyle={C.secondary}
          lineLimit={1}
          minScaleFactor={0.75}
          {...(shadow ? { shadow } : {})}
        >
          {dashboardWindowTitle(props.provider, props.window.label)}
        </Text>
        <Spacer minLength={0} />
        {countdown ? (
          <Text
            font={10}
            fontWeight="medium"
            monospacedDigit
            foregroundStyle={C.secondary}
            layoutPriority={1}
            {...(shadow ? { shadow } : {})}
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
          {...(shadow ? { shadow } : {})}
        >
          {percent(props.window.remainingPercent)}
        </Text>
      </HStack>
      <Progress
        window={props.window}
        width={props.width}
        chromeStyle={props.chromeStyle}
      />
      {workbuddyParts ? (
        <HStack alignment="lastTextBaseline" spacing={3} frame={{ width: props.width }}>
          <Text font={11} fontWeight="semibold" foregroundStyle={C.secondary}
            {...(shadow ? { shadow } : {})}>剩余</Text>
          <Text font={11} fontWeight="semibold" foregroundStyle={C.primary}
            lineLimit={1} minScaleFactor={0.75} monospacedDigit
            {...(shadow ? { shadow } : {})}>
            {workbuddyParts.remaining}
          </Text>
          <Spacer minLength={6} />
          <Text font={11} fontWeight="semibold" foregroundStyle={C.secondary}
            {...(shadow ? { shadow } : {})}>总计</Text>
          <Text font={11} fontWeight="semibold" foregroundStyle={C.secondary}
            lineLimit={1} minScaleFactor={0.75} monospacedDigit
            {...(shadow ? { shadow } : {})}>
            {workbuddyParts.total}
          </Text>
        </HStack>
      ) : props.window.detail ? (
        <Text
          font={9}
          foregroundStyle={C.secondary}
          lineLimit={1}
          minScaleFactor={0.75}
          {...(shadow ? { shadow } : {})}
        >
          {props.window.detail}
        </Text>
      ) : null}
    </VStack>
  );
}

function AccountCell(props: {
  account: DashboardAccount;
  width: number;
  compact: boolean;
  display: DashboardWidgetDisplayPreferences;
  chromeStyle?: WidgetChromeStyle;
}) {
  const meta = providerMeta(props.account.provider);
  const fixedLayout = Boolean(meta.capabilities.fixedWidgetLayout);
  const windows = props.account.windows.slice(0, fixedLayout ? 1 : 2);
  const fixedInformation = props.account.provider === "workbuddy" || props.account.provider === "deepseek";
  const contentHeight = fixedInformation || windows.length === 2
    ? TWO_WINDOW_CONTENT_HEIGHT[props.compact ? "compact" : "regular"]
    : undefined;
  return (
    <VStack
      alignment="leading"
      spacing={props.compact ? 3 : 7}
      frame={{ width: props.width }}
    >
      <DashboardAccountHeader provider={props.account.provider} planLabel={props.account.planLabel}
        accountLabel={props.account.accountTitle} showAccountLabel={props.display.showAccountLabel}
        width={props.width} hasError={props.account.source === "error"} chromeStyle={props.chromeStyle} />
      <VStack alignment="leading" spacing={props.compact ? 3 : 7}
        frame={{ maxWidth: "infinity", minHeight: contentHeight, alignment: "center" }}>
        {windows.map((window) => (
          <WindowRow
            key={window.id}
            provider={props.account.provider}
            window={window}
            width={props.width}
            compact={props.compact}
            chromeStyle={props.chromeStyle}
            errorText={props.account.source === "error" ? "查询失败，显示缓存余额" : undefined}
          />
        ))}
      </VStack>
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
    <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
      <Text
        font={9}
        foregroundStyle={C.secondary}
        {...(C.textShadow ? { shadow: C.textShadow } : {})}
      >
        {props.hiddenAccountCount > 0
          ? `另有 ${props.hiddenAccountCount} 个账号`
          : ""}
      </Text>
      <Spacer minLength={0} />
      <HStack alignment="center" spacing={6}>
        {props.hasErrors ? (
          <Image
            systemName="exclamationmark.triangle.fill"
            font={8}
            foregroundStyle={C.warn}
          />
        ) : null}
        <Text
          font={9}
          foregroundStyle={C.secondary}
          {...(C.textShadow ? { shadow: C.textShadow } : {})}
        >
          {props.refreshText}
        </Text>
        <Button intent={RefreshAIUsageAllIntent(undefined)} buttonStyle="plain">
          <Image
            systemName="arrow.triangle.2.circlepath"
            font={9}
            foregroundStyle={C.accent}
          />
        </Button>
      </HStack>
    </HStack>
  );
}

function SmallDashboard(props: {
  plan: DashboardPlan;
  width: number;
  hasErrors?: boolean;
  display: DashboardWidgetDisplayPreferences;
  chromeStyle?: WidgetChromeStyle;
}) {
  const padding = 12;
  const contentWidth = props.width - padding * 2;
  const accounts = props.plan.accounts.slice(0, 2);
  return (
    <VStack
      alignment="leading"
      spacing={3}
      padding={{ horizontal: padding, top: 10, bottom: 9 }}
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
            chromeStyle={props.chromeStyle}
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
  chromeStyle?: WidgetChromeStyle;
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
    <HStack key={key} alignment="top" spacing={columnGap} frame={{ maxWidth: "infinity" }}>
      {accounts.map((account) => (
        <AccountCell
          key={account.key}
          account={account}
          width={cellWidth}
          compact={compact}
          display={props.display}
          chromeStyle={props.chromeStyle}
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
  chromeStyle?: WidgetChromeStyle;
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
        <Text
          font={15}
          fontWeight="bold"
          foregroundStyle={C.primary}
          {...(C.textShadow ? { shadow: C.textShadow } : {})}
        >
          AI Usage Dashboard
        </Text>
        <Spacer minLength={0} />
        <Text
          font={12}
          foregroundStyle={C.secondary}
          monospacedDigit
          {...(C.textShadow ? { shadow: C.textShadow } : {})}
        >
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
          <HStack alignment="top" spacing={columnGap} frame={{ maxWidth: "infinity" }}>
            {accounts.map((account) => (
              <AccountCell
                key={account.key}
                account={account}
                width={cellWidth}
                compact={true}
                display={props.display}
                chromeStyle={props.chromeStyle}
              />
            ))}
            {accounts.length < 2 ? <Spacer minLength={0} /> : null}
          </HStack>
        </VStack>
      ))}
      <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
        <Spacer minLength={0} />
        <HStack alignment="center" spacing={7}>
          {props.hasErrors ? (
            <Image
              systemName="exclamationmark.triangle.fill"
              font={11}
              foregroundStyle={C.warn}
            />
          ) : null}
          <Text
            font={12}
            foregroundStyle={C.secondary}
            {...(C.textShadow ? { shadow: C.textShadow } : {})}
          >
            {refreshText}
          </Text>
          <Button
            intent={RefreshAIUsageAllIntent(undefined)}
            buttonStyle="plain"
          >
            <Image
              systemName="arrow.triangle.2.circlepath"
              font={13}
              foregroundStyle={C.accent}
            />
          </Button>
        </HStack>
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
  chromeStyle?: WidgetChromeStyle;
  slotCount?: 8 | 12;
}) {
  const padding = 16;
  const columnGap = 20;
  const cellWidth = (props.width - padding * 2 - columnGap) / 2;
  const slots: SparseLargeSlot[] = Array.from({ length: props.slotCount ?? 8 }, (_, index) => {
    const account = props.plan.accounts[index];
    return account
      ? { account, placeholder: false }
      : { account: placeholderLargeAccount(index), placeholder: true };
  });
  const rows: SparseLargeSlot[][] = [];
  for (let i = 0; i < slots.length; i += 2) rows.push(slots.slice(i, i + 2));
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
      spacing={(props.slotCount ?? 8) === 12 ? 12 : 7}
      padding={{ horizontal: padding, vertical: 9 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={C.bg}
    >
      <HStack frame={{ maxWidth: "infinity" }}>
        <Text
          font={15}
          fontWeight="bold"
          foregroundStyle={C.primary}
          {...(C.textShadow ? { shadow: C.textShadow } : {})}
        >
          AI Usage Dashboard
        </Text>
        <Spacer minLength={0} />
        <Text
          font={12}
          foregroundStyle={C.secondary}
          monospacedDigit
          {...(C.textShadow ? { shadow: C.textShadow } : {})}
        >
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
          <HStack alignment="top" spacing={columnGap} frame={{ maxWidth: "infinity" }}>
            {slotsInRow.map((slot) =>
              slot.placeholder ? (
                <VStack key={slot.account.key} opacity={0}>
                  <AccountCell
                    account={slot.account}
                    width={cellWidth}
                    compact={true}
                    display={props.display}
                    chromeStyle={props.chromeStyle}
                  />
                </VStack>
              ) : (
                <AccountCell
                  key={slot.account.key}
                  account={slot.account}
                  width={cellWidth}
                  compact={true}
                  display={props.display}
                  chromeStyle={props.chromeStyle}
                />
              ),
            )}
          </HStack>
        </VStack>
      ))}
      <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
        <Spacer minLength={0} />
        <HStack alignment="center" spacing={7}>
          {props.hasErrors ? (
            <Image
              systemName="exclamationmark.triangle.fill"
              font={11}
              foregroundStyle={C.warn}
            />
          ) : null}
          <Text
            font={12}
            foregroundStyle={C.secondary}
            {...(C.textShadow ? { shadow: C.textShadow } : {})}
          >
            {refreshText}
          </Text>
          <Button
            intent={RefreshAIUsageAllIntent(undefined)}
            buttonStyle="plain"
          >
            <Image
              systemName="arrow.triangle.2.circlepath"
              font={13}
              foregroundStyle={C.accent}
            />
          </Button>
        </HStack>
      </HStack>
    </VStack>
  );
}

export function DashboardWidgetView(props: {
  cards: import("../../models").UsageCard[];
  labelAccounts?: import("../../models").UsageCard[];
  family: string;
  width: number;
  hasErrors?: boolean;
  display?: DashboardWidgetDisplayPreferences;
  chromeStyle?: WidgetChromeStyle;
}) {
  const family = parseWidgetFamily(props.family);
  const display = props.display || readDashboardWidgetPreferences().display;
  if (!family) {
    return <EmptyDashboard message="暂不支持此小组件尺寸" />;
  }
  const plan = planDashboard(props.cards, family, props.labelAccounts);
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
        chromeStyle={props.chromeStyle}
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
        chromeStyle={props.chromeStyle}
      />
    );
  }
  if (family === "extraLargePortrait") {
    return (
      <SparseLargeDashboard plan={plan} width={props.width} hasErrors={props.hasErrors}
        display={display} chromeStyle={props.chromeStyle} slotCount={12} />
    );
  }
  if (plan.accounts.length < 8) {
    return (
      <SparseLargeDashboard
        plan={plan}
        width={props.width}
        hasErrors={props.hasErrors}
        display={display}
        chromeStyle={props.chromeStyle}
      />
    );
  }
  return (
    <LargeDashboard
      plan={plan}
      width={props.width}
      hasErrors={props.hasErrors}
      display={display}
      chromeStyle={props.chromeStyle}
    />
  );
}
