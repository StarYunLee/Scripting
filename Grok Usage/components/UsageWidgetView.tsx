import { WeeklyUsageWidgetView } from "./WeeklyUsageWidgetView"
import type { DisplayMode, UsageResult } from "../services/types"

type Props = {
  result: UsageResult
  family: string
  displayMode: DisplayMode
}

export function UsageWidgetView(props: Props) {
  return <WeeklyUsageWidgetView result={props.result} family={props.family} displayMode={props.displayMode}/>
}
