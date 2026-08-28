import { List, Section, Text } from "scripting";
import {
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";

export function WorkflowPreviewPage(props: {
  title: string;
  path: string;
  content: string;
}) {
  return (
    <List
      navigationTitle={props.title}
      {...glassListPageProps()}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title={props.path} />}
      >
        <GlassGroup>
          <Text
            font={12}
            fontDesign="monospaced"
            padding={{ vertical: true }}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
          >
            {props.content}
          </Text>
        </GlassGroup>
      </Section>
    </List>
  );
}
