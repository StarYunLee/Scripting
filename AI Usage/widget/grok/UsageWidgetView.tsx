import { WeeklyUsageWidgetView } from "./WeeklyUsageWidgetView";
import type { UsageResult } from "../../providers/grok/types";

type Props = {
  result: UsageResult;
  family: string;
};

export function UsageWidgetView(props: Props) {
  return <WeeklyUsageWidgetView result={props.result} family={props.family} />;
}
