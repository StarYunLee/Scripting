import type { VStackProps } from "scripting";
import { HStack, List, Section, Spacer, Text, VStack } from "scripting";
import { CHANGELOG } from "../changelog";
import { PageBackground } from "../components/PageBackground";
import type { BackgroundThemeId } from "../services/settings";

function ChangelogRowBackground() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      listRowSeparator="hidden"
      glassEffect={{
        glass: UIGlass.regular(),
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
    />
  );
}

const changelogRowBackground = <ChangelogRowBackground />;

function ChangelogGroup(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      alignment="leading"
      spacing={10}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      padding={{ vertical: true }}
      listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
      listRowSeparator="hidden"
    >
      {props.children}
    </VStack>
  );
}

function formatReleaseDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}年${month}月${day}日`;
}

function VersionHeader(props: { version: string; date: string }) {
  return (
    <HStack frame={{ maxWidth: "infinity" }}>
      <Text foregroundStyle="secondaryLabel">v{props.version}</Text>
      <Spacer />
      <Text foregroundStyle="secondaryLabel">
        {formatReleaseDate(props.date)}
      </Text>
    </HStack>
  );
}

export function ChangelogPage(props: { backgroundTheme: BackgroundThemeId }) {
  return (
    <List
      navigationTitle="更新日志"
      navigationBarTitleDisplayMode="inline"
      scrollContentBackground="hidden"
      listStyle="plain"
      listRowSeparator="hidden"
      listRowSpacing={12}
      listSectionSpacing={12}
      contentMargins={{
        edges: "horizontal",
        insets: 16,
        placement: "scrollContent",
      }}
      background={<PageBackground theme={props.backgroundTheme} />}
    >
      {CHANGELOG.map((entry) => (
        <Section
          key={entry.version}
          listRowBackground={changelogRowBackground}
          header={<VersionHeader version={entry.version} date={entry.date} />}
        >
          <ChangelogGroup>
            {entry.changes.map((change) => (
              <Text key={change} font={14} lineSpacing={3}>
                • {change}
              </Text>
            ))}
          </ChangelogGroup>
        </Section>
      ))}
    </List>
  );
}
