import { HStack, Image, Picker, Spacer, Text, VStack, ZStack } from "scripting";
import type { AiCutoutTestResult } from "../services/ai-cutout";

/** Preview-only transparent image. 已返回透明 PNG，请核对主体。主体一致性尚未自动证明，需人工核对. Alpha validation does not prove subject fidelity. */
export function AiCutoutTestContent(props: {
  result: AiCutoutTestResult | null;
  previewBackground: string;
  onPreviewBackground?: (value: string) => void;
}) {
  const result = props.result;
  const cutout = result?.cutout;
  return (
    <VStack
      alignment="leading"
      spacing={10}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
      {cutout ? (
        <VStack
          alignment="center"
          spacing={12}
          frame={{ maxWidth: "infinity", alignment: "center" }}
        >
          <HStack
            spacing={10}
            frame={{ maxWidth: "infinity" }}
            alignment="center"
          >
            <HStack spacing={6}>
              <Image
                systemName="checkmark.circle.fill"
                font={14}
                foregroundStyle="#34C759"
              />
              <Text font="footnote" foregroundStyle="#34C759">
                透明主体已就绪
              </Text>
            </HStack>
            <Spacer />
            <Picker
              title="预览底色"
              value={props.previewBackground}
              onChanged={(value: string) =>
                props.onPreviewBackground?.(value)
              }
              pickerStyle="segmented"
              disabled={!props.onPreviewBackground}
              frame={{ width: 124 }}
            >
              <Text tag="light">浅色</Text>
              <Text tag="dark">深色</Text>
            </Picker>
          </HStack>
          <ZStack
            alignment="center"
            frame={{ width: 220, height: 220 }}
            background={
              props.previewBackground === "dark" ? "#20242C" : "#F3F4F6"
            }
            clipShape={{ type: "rect", cornerRadius: 20 }}
          >
            <Image
              image={cutout.image}
              resizable
              scaleToFit
              renderingMode="original"
              interpolation="high"
              frame={{ width: 220, height: 220 }}
              clipShape={{ type: "rect", cornerRadius: 20 }}
            />
          </ZStack>
          <Text font="caption2" foregroundStyle="secondaryLabel">
            预览底色仅用于对比抠图边缘与透明效果
          </Text>
        </VStack>
      ) : result?.error ? (
        <Text
          font="footnote"
          foregroundStyle="systemRed"
          textSelection={true}
          fixedSize={{ horizontal: false, vertical: true }}
        >
          {result.error}
        </Text>
      ) : null}
    </VStack>
  );
}
