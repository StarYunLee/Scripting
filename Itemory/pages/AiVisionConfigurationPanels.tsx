import {
  Button,
  List,
  Navigation,
  NavigationStack,
  TextField,
  useRef,
  useState,
} from "scripting";
import { appListProps, AppSection } from "../ui/theme-props";
import { useSettingsTheme } from "../ui/theme";


/** Local editor: swipe/cancel does not mutate parent draft or Storage. */
export function AiVisionPromptEditorPage(props: {
  value: string;
  defaultValue: string;
  title: string;
}) {
  const dismiss = Navigation.useDismiss();
  const uiTheme = useSettingsTheme();
  const initial = props.value;
  const [value, setValue] = useState(initial);
  const applied = useRef(false);
  const normalized = (text: string) =>
    text.trim() === props.defaultValue.trim() ? "" : text.trim();
  function apply() {
    if (
      applied.current ||
      !value.trim() ||
      normalized(value) === normalized(initial)
    )
      return;
    applied.current = true;
    dismiss(value.trim());
  }
  return (
    <NavigationStack>
      <List
        navigationTitle={props.title}
        {...appListProps(uiTheme, "inline")}
        toolbar={{
          confirmationAction: (
            <Button
              title="保存"
              disabled={
                !value.trim() || normalized(value) === normalized(initial)
              }
              action={apply}
            />
          ),
          topBarLeading: (
            <Button
              title="恢复默认"
              disabled={!normalized(value)}
              action={() => setValue(props.defaultValue)}
            />
          ),
        }}
      >
        <AppSection theme={uiTheme}>
            <TextField
              title=" "
              value={value}
              onChanged={setValue}
              axis="vertical"
              frame={{ maxWidth: "infinity" }}
            />
        </AppSection>
      </List>
    </NavigationStack>
  );
}
