import {
  HStack,
  List,
  Section,
  Spacer,
  Text,
  VStack,
  type VStackProps,
} from "scripting";
import { CHANGELOG } from "../changelog";
import { glassRowBackground } from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";

function ChangelogGroup(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      alignment="leading"
      spacing={10}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      padding={{ vertical: true }}
      listRowSeparator="hidden"
      listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
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

/** 仅版本更新日志；介绍放在设置页底部。 */
export function AboutPage() {
  return (
    <List
      navigationTitle="版本信息"
      {...glassListPageProps()}
    >
      {CHANGELOG.map((entry) => (
        <Section
          key={entry.version}
          listRowBackground={glassRowBackground}
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
