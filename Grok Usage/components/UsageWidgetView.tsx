import { DetailWidgetView } from "./DetailWidgetView"
import { OverviewWidgetView } from "./OverviewWidgetView"
import type { DisplayMode, FocusWindow, UsageResult, WidgetLayout } from "../services/types"

type Props = {
  result: UsageResult
  family: string
  displayMode: DisplayMode
  focusWindow: FocusWindow
  widgetLayout: WidgetLayout
}

export function UsageWidgetView(props: Props) {
  return props.widgetLayout === "detail"
    ? <DetailWidgetView result={props.result} family={props.family} displayMode={props.displayMode} focusWindow={props.focusWindow}/>
    : <OverviewWidgetView result={props.result} family={props.family} displayMode={props.displayMode} focusWindow={props.focusWindow}/>
}
