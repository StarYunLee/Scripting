import { glassListShell } from "./Glass";
import { PageBackground } from "./PageBackground";

/**
 * 返回 List 的公共玻璃壳 props。
 * 注意：必须直接用在 <List {...glassListPageProps(...)} /> 上，
 * 不要再包一层自定义组件——NavigationStack 的 navigationDestination
 * 依赖 List 作为直接子节点，中间包一层会出现“点进去立刻返回”。
 */
export function glassListPageProps() {
  return {
    navigationBarTitleDisplayMode: "inline" as const,
    scrollContentBackground: glassListShell.scrollContentBackground,
    listStyle: glassListShell.listStyle,
    listRowSpacing: glassListShell.listRowSpacing,
    listSectionSpacing: glassListShell.listSectionSpacing,
    contentMargins: glassListShell.contentMargins,
    background: <PageBackground />,
  };
}
