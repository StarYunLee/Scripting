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
import { glassListPageProps } from "../ui/glass-list-page";
import { GlassGroup, glassRowBackground } from "../ui/glass";

function ChangelogGroup(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      alignment="leading"
      spacing={8}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      padding={{ vertical: true }}
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

export function ChangelogPage() {
  return (
    <List navigationTitle="版本信息" {...glassListPageProps()}>
      {CHANGELOG.map((entry) => (
        <Section
          key={entry.version}
          listRowBackground={glassRowBackground}
          header={<VersionHeader version={entry.version} date={entry.date} />}
        >
          <GlassGroup>
            <ChangelogGroup>
              {entry.changes.map((change) => (
                <Text key={change} font={14} lineSpacing={3}>
                  • {change}
                </Text>
              ))}
            </ChangelogGroup>
          </GlassGroup>
        </Section>
      ))}
    </List>
  );
}
