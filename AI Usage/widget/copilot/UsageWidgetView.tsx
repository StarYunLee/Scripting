import {
  EmptyView,
  HStack,
  Image,
  Script,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
} from "scripting";
import { usageTint } from "../../services/usage-colors";
import {
  formatPercent,
  formatResetDate,
  formatSmallDate,
} from "../../providers/copilot/format";
import {
  COPILOT_WIDGET,
  copilotWidgetColors,
} from "../../providers/copilot/theme";
import { PlanBadge } from "./PlanBadge";
import type {
  LimitWindow,
  UsageResult,
  UsageSnapshot,
} from "../../providers/copilot/types";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow?: "credits" | "chat" | "completions";
  widgetStyle?: "dual" | "single";
  dualQuotaPreset?: "credits_chat" | "credits_completions" | "chat_completions";
};

const C = copilotWidgetColors();

type Model = {
  snapshot: UsageSnapshot | null;
  primary: LimitWindow | null;
  secondary: LimitWindow | null;
  primaryShort: string;
  secondaryShort: string;
  planLabel: string;
  fetched: string;
  live: boolean;
  detail: string;
};

function shortLabel(window: LimitWindow | null): string {
  if (!window) return "—";
  if (window.name === "credits") return COPILOT_WIDGET.shortCredits;
  if (window.name === "chat") return COPILOT_WIDGET.shortChat;
  if (window.name === "completions") return COPILOT_WIDGET.shortCompletions;
  return window.label;
}

function modelFor(result: UsageResult): Model {
  const snapshot = result.ok ? result.snapshot : result.cache || null;
  const credits = snapshot?.credits || null;
  const chat = snapshot?.chat || null;
  const completions = snapshot?.completions || null;

  let primary = credits || chat || snapshot?.windows?.[0] || null;
  let secondary: LimitWindow | null = null;
  if (credits) {
    secondary = chat || completions || null;
  } else if (chat && completions) {
    secondary = primary === chat ? completions : chat;
  } else {
    secondary = snapshot?.windows?.[1] || null;
  }

  return {
    snapshot,
    primary,
    secondary,
    primaryShort: shortLabel(primary),
    secondaryShort: shortLabel(secondary),
    planLabel: snapshot?.planLabel || snapshot?.planType || "—",
    fetched: snapshot ? formatResetDate(snapshot.fetchedAt) : "—",
    live: result.ok,
    detail: result.ok ? "" : result.error.message,
  };
}

function windowByName(
  snapshot: UsageSnapshot | null,
  name: string,
): LimitWindow | null {
  if (!snapshot) return null;
  if (name === "credits") return snapshot.credits;
  if (name === "chat") return snapshot.chat;
  if (name === "completions") return snapshot.completions;
  return null;
}

function pickFocusWindow(
  snapshot: UsageSnapshot | null,
  focus: Props["focusWindow"],
): LimitWindow | null {
  if (!snapshot) return null;
  const preferred = windowByName(snapshot, focus || "credits");
  if (preferred) return preferred;
  const order = ["credits", "chat", "completions"];
  for (const name of order) {
    const window = windowByName(snapshot, name);
    if (window) return window;
  }
  return snapshot.windows[0] || null;
}

function pickDualWindows(
  snapshot: UsageSnapshot | null,
  preset: NonNullable<Props["dualQuotaPreset"]>,
): { primary: LimitWindow | null; secondary: LimitWindow | null } {
  let firstName = "credits";
  let secondName = "chat";
  if (preset === "credits_completions") {
    secondName = "completions";
  } else if (preset === "chat_completions") {
    firstName = "chat";
    secondName = "completions";
  }
  if (!snapshot) return { primary: null, secondary: null };
  const picked: LimitWindow[] = [];
  const first = windowByName(snapshot, firstName);
  const second = windowByName(snapshot, secondName);
  if (first) picked.push(first);
  if (second) picked.push(second);
  const order = ["credits", "chat", "completions"];
  for (const name of order) {
    if (picked.length >= 2) break;
    if (name === firstName || name === secondName) continue;
    const window = windowByName(snapshot, name);
    if (window) picked.push(window);
  }
  for (const window of snapshot.windows) {
    if (picked.length >= 2) break;
    if (picked.indexOf(window) < 0) picked.push(window);
  }
  return { primary: picked[0] || null, secondary: picked[1] || null };
}

function singleTitle(
  window: LimitWindow | null,
  focus: Props["focusWindow"],
): string {
  const name = window?.name || focus || "credits";
  if (name === "credits") return COPILOT_WIDGET.creditsTitle;
  if (name === "chat") return COPILOT_WIDGET.chatTitle;
  if (name === "completions") return COPILOT_WIDGET.completionsTitle;
  return window?.label || COPILOT_WIDGET.creditsTitle;
}

function singleShortTitle(
  window: LimitWindow | null,
  focus: Props["focusWindow"],
): string {
  const name = window?.name || focus || "credits";
  if (name === "credits") return COPILOT_WIDGET.shortCredits;
  if (name === "chat") return COPILOT_WIDGET.shortChat;
  if (name === "completions") return COPILOT_WIDGET.shortCompletions;
  return shortLabel(window);
}

function isSmall(family: string): boolean {
  const value = family.toLowerCase();
  return value.includes("small") && !value.includes("medium");
}

function displayWidth(family: string): number {
  try {
    const width = (Widget as { displaySize?: { width?: number } }).displaySize
      ?.width;
    if (width && width > 40) return width;
  } catch {
    /* ignore */
  }
  return isSmall(family) ? 158 : 338;
}

function Watermark({ size }: { size: number }) {
  return (
    <Image
      filePath={`${Script.directory}/assets/watermark-copilot.png`}
      resizable
      scaleToFit
      renderingMode="template"
      foregroundStyle={C.watermark}
      frame={{ width: size, height: size }}
    />
  );
}

function Progress(props: {
  displayValue: number | null;
  usedPercent: number | null | undefined;
  remainingPercent: number | null | undefined;
  width: number;
  height?: number;
}) {
  const shown =
    props.displayValue == null
      ? null
      : Math.max(0, Math.min(100, props.displayValue));
  const fill = shown == null ? 0 : (props.width * shown) / 100;
  return (
    <ZStack alignment="leading" frame={{ width: props.width, height: props.height ?? 5 }}>
      <HStack
        frame={{ width: props.width, height: props.height ?? 5 }}
        background={C.track}
        border={{ style: C.trackBorder, width: 0.5 }}
        clipShape={{ type: "capsule", style: "continuous" }}
      />
      {fill > 0 ? (
        <HStack
          frame={{ width: Math.max(props.height ?? 5, fill), height: props.height ?? 5 }}
          background={usageTint(props.usedPercent, props.remainingPercent)}
          clipShape={{ type: "capsule", style: "continuous" }}
        />
      ) : <EmptyView />}
    </ZStack>
  );
}

function shownPercent(window: LimitWindow | null): string {
  return formatPercent(window?.remainingPercent);
}

function SmallReset({ value }: { value: string }) {
  return (
    <HStack alignment="center" spacing={3}>
      <Image
        systemName="calendar"
        resizable
        scaleToFit
        imageScale="small"
        foregroundStyle={C.secondary}
        frame={{ width: 9, height: 9 }}
      />
      <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
        重置
      </Text>
      <Text
        font={10}
        fontWeight="bold"
        foregroundStyle={C.primary}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {value}
      </Text>
    </HStack>
  );
}

function SmallWindow(props: {
  title: string;
  window: LimitWindow | null;
  width: number;
  top: number;
}) {
  return (
    <>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: props.top }}
      >
        <Text font={12} fontWeight="bold" foregroundStyle={C.accent}>
          {props.title}
        </Text>
        <Spacer />
        <HStack alignment="center" spacing={3}>
          <Image
            systemName="chart.pie.fill"
            resizable
            scaleToFit
            imageScale="small"
            foregroundStyle={C.accent}
            frame={{ width: 10, height: 10 }}
          />
          <Text font={11} fontWeight="bold" foregroundStyle={C.primary}>
            剩余 {shownPercent(props.window)}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, top: props.top + 20 }}
      >
        <Progress
          displayValue={props.window?.remainingPercent ?? null}
          usedPercent={props.window?.usedPercent}
          remainingPercent={props.window?.remainingPercent}
          width={props.width}
          height={5}
        />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 12, trailing: 12, top: props.top + 30 }}
      >
        <SmallReset value={formatSmallDate(props.window?.resetAt)} />
      </HStack>
    </>
  );
}

function MediumWindow(props: {
  title: string;
  window: LimitWindow | null;
  width: number;
  top: number;
}) {
  return (
    <>
      <HStack
        alignment="lastTextBaseline"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: props.top }}
      >
        <Text font={15} fontWeight="bold" foregroundStyle={C.primary}>
          {props.title}
        </Text>
        <Spacer />
        <HStack alignment="center" spacing={4}>
          <Image
            systemName="chart.pie.fill"
            resizable
            scaleToFit
            imageScale="small"
            foregroundStyle={C.accent}
            frame={{ width: 12, height: 12 }}
          />
          <Text font={14} fontWeight="bold" foregroundStyle={C.primary}>
            剩余 {shownPercent(props.window)}
          </Text>
        </HStack>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: props.top + 24 }}
      >
        <Progress
          displayValue={props.window?.remainingPercent ?? null}
          usedPercent={props.window?.usedPercent}
          remainingPercent={props.window?.remainingPercent}
          width={props.width}
          height={7}
        />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: props.top + 36 }}
      >
        <SmallReset value={formatResetDate(props.window?.resetAt)} />
      </HStack>
    </>
  );
}

function MinRemainingCapsule(props: {
  primary: LimitWindow | null;
  secondary: LimitWindow | null;
}) {
  const values = [props.primary, props.secondary]
    .map((window) => window?.remainingPercent)
    .flatMap((value) => (value != null && !Number.isNaN(value) ? [value] : []));
  if (!values.length) return <EmptyView />;
  const min = Math.min(...values);
  return (
    <HStack
      padding={{ horizontal: 10, vertical: 6 }}
      background={C.capsuleBg}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <Text font={12} fontWeight="semibold" foregroundStyle={C.capsuleFg}>
        最低剩余 {formatPercent(min)}
      </Text>
    </HStack>
  );
}

function SingleWindowView(props: {
  model: Model;
  family: string;
  focusWindow?: "credits" | "chat" | "completions";
}) {
  const model = props.model;
  const small = isSmall(props.family);
  const width = displayWidth(props.family);
  const focus = pickFocusWindow(model.snapshot, props.focusWindow);

  if (small) {
    const contentWidth = Math.max(112, width - 24);
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
          padding={{ trailing: -6, bottom: -6 }}
        >
          <Watermark size={96} />
        </HStack>
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, trailing: 12, top: 18 }}
        >
          <PlanBadge label={model.planLabel} small />
          <Spacer minLength={0} />
          <Text
            font={8}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            minScaleFactor={0.75}
          >
            {formatSmallDate(model.snapshot?.fetchedAt)}
          </Text>
        </HStack>
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, trailing: 12, top: 40 }}
        >
          <Text font={12} fontWeight="bold" foregroundStyle={C.accent}>
            {singleShortTitle(focus, props.focusWindow)}
          </Text>
        </HStack>
        <HStack
          alignment="lastTextBaseline"
          spacing={4}
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, top: 56 }}
        >
          <Text
            font={26}
            fontWeight="bold"
            foregroundStyle={C.primary}
            minScaleFactor={0.5}
          >
            {shownPercent(focus)}
          </Text>
          <Text font={10} fontWeight="medium" foregroundStyle={C.secondary}>
            剩余
          </Text>
        </HStack>
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, top: 94 }}
        >
          <Progress
            displayValue={focus?.remainingPercent ?? null}
            usedPercent={focus?.usedPercent}
            remainingPercent={focus?.remainingPercent}
            width={contentWidth}
            height={5}
          />
        </HStack>
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, trailing: 12, top: 104 }}
        >
          <SmallReset value={formatSmallDate(focus?.resetAt)} />
        </HStack>
        {!model.live && model.detail ? (
          <HStack
            frame={{
              maxWidth: "infinity",
              maxHeight: "infinity",
              alignment: "bottomLeading",
            }}
            padding={{ horizontal: 12, bottom: 2 }}
          >
            <Text font={7} foregroundStyle={C.warn} lineLimit={1}>
              {model.detail}
            </Text>
          </HStack>
        ) : <EmptyView />}
      </ZStack>
    );
  }

  const contentWidth = Math.max(220, width - 40);
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
        padding={{ trailing: -7, bottom: -11 }}
      >
        <Watermark size={135} />
      </HStack>
      <HStack
        alignment="top"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 9 }}
      >
        <PlanBadge label={model.planLabel} />
        <Spacer minLength={0} />
        <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
          更新 {model.fetched}
        </Text>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 38 }}
      >
        <Text font={17} fontWeight="bold" foregroundStyle={C.primary}>
          {singleTitle(focus, props.focusWindow)}
        </Text>
      </HStack>
      <HStack
        alignment="lastTextBaseline"
        spacing={7}
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: 62 }}
      >
        <Text
          font={40}
          fontWeight="bold"
          foregroundStyle={C.primary}
          minScaleFactor={0.4}
        >
          {shownPercent(focus)}
        </Text>
        <Text font={12} fontWeight="medium" foregroundStyle={C.secondary}>
          剩余
        </Text>
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, top: 112 }}
      >
        <Progress
          displayValue={focus?.remainingPercent ?? null}
          usedPercent={focus?.usedPercent}
          remainingPercent={focus?.remainingPercent}
          width={contentWidth}
          height={7}
        />
      </HStack>
      <HStack
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 126 }}
      >
        <SmallReset value={formatResetDate(focus?.resetAt)} />
      </HStack>
      {!model.live && model.detail ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomLeading",
          }}
          padding={{ horizontal: 20, bottom: 2 }}
        >
          <Text font={8} foregroundStyle={C.warn} lineLimit={1}>
            {model.detail}
          </Text>
        </HStack>
      ) : <EmptyView />}
    </ZStack>
  );
}

export function UsageWidgetView({
  result,
  family,
  focusWindow,
  widgetStyle,
  dualQuotaPreset,
}: Props) {
  const model = modelFor(result);
  if (widgetStyle === "single") {
    return (
      <SingleWindowView
        model={model}
        family={family}
        focusWindow={focusWindow}
      />
    );
  }
  let primary = model.primary;
  let secondary = model.secondary;
  let primaryShort = model.primaryShort;
  let secondaryShort = model.secondaryShort;
  if (dualQuotaPreset) {
    const picked = pickDualWindows(model.snapshot, dualQuotaPreset);
    primary = picked.primary;
    secondary = picked.secondary;
    primaryShort = shortLabel(primary);
    secondaryShort = shortLabel(secondary);
  }
  const small = isSmall(family);
  const width = displayWidth(family);

  if (small) {
    const contentWidth = Math.max(112, width - 24);
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
          padding={{ trailing: -6, bottom: -6 }}
        >
          <Watermark size={96} />
        </HStack>
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "topLeading",
          }}
          padding={{ leading: 12, trailing: 12, top: 18 }}
        >
          <PlanBadge label={model.planLabel} small />
          <Spacer minLength={0} />
          <Text
            font={8}
            fontWeight="medium"
            foregroundStyle={C.secondary}
            lineLimit={1}
            minScaleFactor={0.75}
          >
            {formatSmallDate(model.snapshot?.fetchedAt)}
          </Text>
        </HStack>
        <SmallWindow
          title={primaryShort}
          window={primary}
          width={contentWidth}
          top={43}
        />
        <SmallWindow
          title={secondaryShort}
          window={secondary}
          width={contentWidth}
          top={99}
        />
        {!model.live && model.detail ? (
          <HStack
            frame={{
              maxWidth: "infinity",
              maxHeight: "infinity",
              alignment: "bottomLeading",
            }}
            padding={{ horizontal: 12, bottom: 2 }}
          >
            <Text font={7} foregroundStyle={C.warn} lineLimit={1}>
              {model.detail}
            </Text>
          </HStack>
        ) : <EmptyView />}
      </ZStack>
    );
  }

  const contentWidth = Math.max(220, width - 40);
  const primaryTitle = primary?.label || COPILOT_WIDGET.creditsTitle;
  const secondaryTitle = secondary?.label || COPILOT_WIDGET.chatTitle;
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
        padding={{ trailing: -7, bottom: -11 }}
      >
        <Watermark size={135} />
      </HStack>
      <HStack
        alignment="top"
        frame={{
          maxWidth: "infinity",
          maxHeight: "infinity",
          alignment: "topLeading",
        }}
        padding={{ leading: 20, trailing: 20, top: 9 }}
      >
        <PlanBadge label={model.planLabel} />
        <Spacer minLength={0} />
        <VStack alignment="trailing" spacing={4}>
          <MinRemainingCapsule primary={primary} secondary={secondary} />
          <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}>
            更新 {model.fetched}
          </Text>
        </VStack>
      </HStack>
      <MediumWindow
        title={primaryTitle}
        window={primary}
        width={contentWidth}
        top={38}
      />
      <MediumWindow
        title={secondaryTitle}
        window={secondary}
        width={contentWidth}
        top={96}
      />
      {!model.live && model.detail ? (
        <HStack
          frame={{
            maxWidth: "infinity",
            maxHeight: "infinity",
            alignment: "bottomLeading",
          }}
          padding={{ horizontal: 20, bottom: 2 }}
        >
          <Text font={8} foregroundStyle={C.warn} lineLimit={1}>
            {model.detail}
          </Text>
        </HStack>
      ) : <EmptyView />}
    </ZStack>
  );
}
