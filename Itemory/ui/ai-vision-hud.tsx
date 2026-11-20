import {
  Button,
  ProgressView,
  Text,
  VStack,
  ZStack,
  useEffect,
  useState,
} from "scripting";

/** Keep processing updates outside the settings List so its scroll position is not rebuilt. */
export function AiVisionHudOverlay(props: {
  onReady(update: ((phase: string | null) => void) | null): void;
  onCancel(): void;
}) {
  const [phase, setPhase] = useState<string | null>(null);
  useEffect(() => {
    props.onReady(setPhase);
    return () => props.onReady(null);
  }, []);
  return phase ? <AiVisionHud phase={phase} onCancel={props.onCancel} /> : null;
}

/** Centered native progress panel used during parse/cutout. */
export function AiVisionHud(props: {
  phase: string;
  onCancel(): void;
  cancelTitle?: string;
}) {
  return (
    <ZStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      allowsHitTesting={true}
    >
      <VStack
        spacing={16}
        padding={{ top: 22, bottom: 18, leading: 20, trailing: 20 }}
        alignment="center"
        frame={{ width: 220 }}
        glassEffect={{
          glass: UIGlass.regular(),
          shape: { type: "rect", cornerRadius: 20, style: "continuous" },
        }}
        shadow={{ color: "rgba(0,0,0,0.12)", radius: 18, y: 6 }}
        allowsHitTesting={true}
      >
        <ProgressView progressViewStyle="circular" controlSize="large" />
        <Text
          font="subheadline"
          foregroundStyle="label"
          lineLimit={2}
          multilineTextAlignment="center"
          frame={{ maxWidth: "infinity", alignment: "center" }}
        >
          {props.phase}
        </Text>
        <Button
          buttonStyle="bordered"
          buttonBorderShape="capsule"
          controlSize="large"
          tint="label"
          action={props.onCancel}
        >
          <Text
            font={17}
            fontWeight="semibold"
            frame={{ minWidth: 120, minHeight: 24 }}
          >
            {props.cancelTitle ?? "取消"}
          </Text>
        </Button>
      </VStack>
    </ZStack>
  );
}
