import { glassListShell } from "./glass";
import { PageBackground } from "./page-background";

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
