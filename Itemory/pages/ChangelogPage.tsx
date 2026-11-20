import { List, Text, VStack } from "scripting";
import { CHANGELOG } from "../changelog";
import { NativeSectionHeader } from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";
import { useSettingsTheme } from "../ui/theme";
import { GlassSectionHeader } from "../ui/glass-settings";

function formatReleaseDate(value: string): string {
  const parts = value.split("-");
  if (parts.length === 3) {
    return `${parts[0]}年${parts[1]}月${parts[2]}日`;
  }
  return value;
}

export function ChangelogPage() {
  const uiTheme = useSettingsTheme();

  if (uiTheme === "glass") {
    return (
      <List {...appListProps("glass", "inline")}>
        {CHANGELOG.map((entry) => (
          <AppSection
            theme="glass"
            key={entry.version}
            header={
              <GlassSectionHeader
                title={`v${entry.version}`}
                detail={formatReleaseDate(entry.date)}
              />
            }
          >
            <VStack
                alignment="leading"
                spacing={10}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                {entry.changes.map((change) => (
                  <Text
                    key={change}
                    font={14}
                    lineSpacing={3}
                    frame={{ maxWidth: "infinity", alignment: "leading" }}
                  >
                    • {change}
                  </Text>
                ))}
              </VStack>
          </AppSection>
        ))}
      </List>
    );
  }

  return (
    <List {...appListProps(uiTheme, "inline")}>
      {CHANGELOG.map((entry) => (
        <AppSection
          theme={uiTheme}
          key={entry.version}
          header={
            <NativeSectionHeader
              title={`v${entry.version}`}
              detail={formatReleaseDate(entry.date)}
            />
          }
        >
          <VStack
            spacing={10}
            alignment="leading"
            frame={{ maxWidth: "infinity", alignment: "leading" }}
          >
            {entry.changes.map((change) => (
              <Text
                key={change}
                font="subheadline"
                lineSpacing={3}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                • {change}
              </Text>
            ))}
          </VStack>
        </AppSection>
      ))}
    </List>
  );
}
