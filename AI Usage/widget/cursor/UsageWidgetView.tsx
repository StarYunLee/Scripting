import { BillingUsageWidgetView } from "./BillingUsageWidgetView";
import type { UsageResult } from "../../providers/cursor/types";

type Props = {
  result: UsageResult;
  family: string;
  hiddenWindows?: string[];
};

export function UsageWidgetView(props: Props) {
  return (
    <BillingUsageWidgetView
      result={props.result}
      family={props.family}
      hiddenWindows={props.hiddenWindows}
    />
  );
}
