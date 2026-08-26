import { WeeklyUsageWidgetView } from "./WeeklyUsageWidgetView";
import type { FocusWindow, UsageResult } from "../../providers/grok/types";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow?: FocusWindow;
};

export function UsageWidgetView(props: Props) {
  return (
    <WeeklyUsageWidgetView
      result={props.result}
      family={props.family}
      focusWindow={props.focusWindow}
    />
  );
}
