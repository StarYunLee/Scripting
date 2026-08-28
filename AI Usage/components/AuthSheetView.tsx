import {
  Button,
  HStack,
  List,
  NavigationStack,
  Section,
  Spacer,
  Text,
  TextField,
} from "scripting";
import { providerMeta, type AuthSheet } from "../models";
import { PageBackground } from "./PageBackground";
import {
  GlassDivider,
  GlassGroup,
  GlassNoteRow,
  glassRowBackground,
} from "./GlassList";
import type { BackgroundThemeId } from "../services/settings";

export function AuthSheetView(props: {
  authSheet: AuthSheet;
  backgroundTheme: BackgroundThemeId;
  onChangeInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const meta = providerMeta(props.authSheet.provider);
  return (
    <NavigationStack>
      <List
        navigationTitle={`连接 ${meta.title}`}
        navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden"
        listStyle="plain"
        listRowSpacing={12}
        listSectionSpacing={12}
        contentMargins={{
          edges: "horizontal",
          insets: 16,
          placement: "scrollContent",
        }}
        background={<PageBackground theme={props.backgroundTheme} />}
        toolbar={{
          cancellationAction: <Button title="取消" action={props.onCancel} />,
        }}
      >
        <Section listRowBackground={glassRowBackground}>
          <GlassGroup>
            {props.authSheet.status ? (
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
              >
                <Text>{props.authSheet.status}</Text>
                <Spacer />
              </HStack>
            ) : null}
            {props.authSheet.status ? <GlassDivider /> : null}
            <TextField
              title="授权内容"
              value={props.authSheet.authorizationInput}
              onChanged={props.onChangeInput}
              prompt={meta.pastePlaceholder}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            />
            <GlassDivider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              action={props.onSubmit}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text foregroundStyle="accentColor">提交并完成授权</Text>
                <Spacer />
              </HStack>
            </Button>
            <GlassDivider />
            <GlassNoteRow text={meta.pasteHint} />
          </GlassGroup>
        </Section>
      </List>
    </NavigationStack>
  );
}
