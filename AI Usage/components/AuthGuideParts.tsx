import { Button, HStack, Image, Picker, ProgressView, Text, VStack, type VStackProps, type Color } from "scripting";
import type { AuthGuideRegion, AuthGuideRegionOption } from "../services/auth-guide";

// One shared action size: full-width capsules so every card lines up on the same edges and height.
export const AUTH_GUIDE_ACTION_SIZE = { textHeight: 20, font: 17 } as const;
/** Step icons share one gutter so body rows (examples, hints) line up with the step text. */
export const AUTH_GUIDE_ICON_COLUMN = 26;

export function AuthGuideAction(props: {
  title: string;
  action: () => void;
  disabled?: boolean;
  tint?: Color;
}) {
  return (
    <Button controlSize="large" buttonStyle="glassProminent" buttonBorderShape="capsule"
      tint={props.tint} disabled={props.disabled} action={props.action} frame={{ maxWidth: "infinity" }}>
      <Text font={AUTH_GUIDE_ACTION_SIZE.font} fontWeight="semibold"
        multilineTextAlignment="center" lineLimit={1} minScaleFactor={0.8}
        frame={{ maxWidth: "infinity", minHeight: AUTH_GUIDE_ACTION_SIZE.textHeight }}>
        {props.title}
      </Text>
    </Button>
  );
}

/** A binary choice uses the system segmented control instead of two competing glass buttons. */
export function AuthGuideRegionPicker(props: {
  options: AuthGuideRegionOption[];
  value: AuthGuideRegion;
  disabled?: boolean;
  onChange: (value: AuthGuideRegion) => void;
}) {
  return (
    <Picker title="" value={props.value} pickerStyle="segmented" disabled={props.disabled}
      onChanged={(value: string | number) => { if (value !== props.value) props.onChange(value as AuthGuideRegion); }}
      frame={{ maxWidth: "infinity" }}>
      {props.options.map(option => <Text tag={option.value} font={14}>{option.label}</Text>)}
    </Picker>
  );
}

/** In-flight work is progress, never a disabled button. */
export function AuthGuideSpinner(props: { label: string }) {
  return (
    <HStack spacing={10} padding={{ vertical: 4 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <ProgressView />
      <Text font={15} foregroundStyle="secondaryLabel">{props.label}</Text>
    </HStack>
  );
}

export function AuthGuideStep(props: {
  number: number;
  title: string;
  detail?: string;
  active?: boolean;
  children?: VStackProps["children"];
}) {
  const showBody = Array.isArray(props.children)
    ? props.children.some(Boolean)
    : Boolean(props.children);
  return (
    <VStack alignment="leading" spacing={14} padding={{ vertical: 16 }} frame={{ maxWidth: "infinity" }}>
      <HStack alignment="top" spacing={10}>
        <Image systemName={`${props.number}.circle.fill`} font={24}
          foregroundStyle={props.active ? "label" : "secondaryLabel"}
          frame={{ width: AUTH_GUIDE_ICON_COLUMN, alignment: "center" }} />
        <VStack alignment="leading" spacing={5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font={17} fontWeight="semibold">{props.title}</Text>
          {props.detail ? <Text font={14} foregroundStyle="secondaryLabel">{props.detail}</Text> : null}
        </VStack>
      </HStack>
      {showBody ? <VStack alignment="leading" spacing={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>{props.children}</VStack> : null}
    </VStack>
  );
}

export function AuthGuideNotice(props: { title: string; detail?: string; error?: boolean }) {
  return (
    <HStack alignment="top" spacing={8} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Image systemName={props.error ? "exclamationmark.circle" : "clock"} font={16}
        foregroundStyle={props.error ? "systemOrange" : "secondaryLabel"} />
      <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font={15} fontWeight="medium" foregroundStyle={props.error ? "systemOrange" : "label"}>{props.title}</Text>
        {props.detail ? <Text font={13} foregroundStyle="secondaryLabel">{props.detail}</Text> : null}
      </VStack>
    </HStack>
  );
}
