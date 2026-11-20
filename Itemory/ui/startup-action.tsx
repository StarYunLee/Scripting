import { Button, Text } from "scripting";

export function StartupActionButton(props: {
  title: string;
  prominent?: boolean;
  disabled?: boolean;
  role?: "destructive";
  action: () => void;
}) {
  return (
    <Button
      role={props.role}
      buttonStyle={props.prominent ? "borderedProminent" : "bordered"}
      controlSize="large"
      disabled={props.disabled}
      action={props.action}
      frame={{ maxWidth: 280 }}
    >
      <Text frame={{ maxWidth: "infinity" }} multilineTextAlignment="center">{props.title}</Text>
    </Button>
  );
}
