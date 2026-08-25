import { DetailWidgetView } from "./DetailWidgetView";
import { OverviewWidgetView } from "./OverviewWidgetView";
import type {
  FocusWindow,
  UsageResult,
  WidgetLayout,
} from "../../providers/codex/types";

type Props = {
  result: UsageResult;
  family: string;
  focusWindow: FocusWindow;
  widgetLayout: WidgetLayout;
};

export function UsageWidgetView(props: Props) {
  return props.widgetLayout === "overview" ? (
    <OverviewWidgetView
      result={props.result}
      family={props.family}
      focusWindow={props.focusWindow}
    />
  ) : (
    <DetailWidgetView
      result={props.result}
      family={props.family}
      focusWindow={props.focusWindow}
    />
  );
}
