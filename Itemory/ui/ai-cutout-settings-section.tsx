import { HStack, Image, Picker, Text } from "scripting";
import {
  AI_CUTOUT_REQUEST_FORMATS,
  aiCutoutRequestFormatLabel,
  type AiCutoutRequestFormat,
} from "../services/ai-cutout-config";

/** In-place image-model menu. Selection saves immediately via onChanged. */
export function AiCutoutSettingsSection(props: {
  model: string;
  models: string[];
  disabled: boolean;
  onChanged(model: string): void;
}) {
  const options = Array.from(
    new Set(
      (props.models.length ? props.models : [props.model]).filter(Boolean),
    ),
  );
  return (
    <HStack spacing={10} disabled={props.disabled}>
        <Image
          systemName="wand.and.stars"
          font={16}
          foregroundStyle="#AF52DE"
          frame={{ width: 22 }}
        />
        <Text lineLimit={1}>生成模型</Text>
        <Picker
          title="生成模型"
          labelsHidden
          value={props.model}
          onChanged={props.onChanged}
          pickerStyle="menu"
          frame={{ maxWidth: "infinity", alignment: "trailing" }}
        >
          {props.model ? null : <Text tag="">未选择</Text>}
          {options.map((id) => (
            <Text key={id} tag={id}>
              {id}
            </Text>
          ))}
        </Picker>
    </HStack>
  );
}

/** Images Edits request format. "自动" keeps JSON first with Multipart only on 404/405/415. */
export function AiCutoutRequestFormatRow(props: {
  value: AiCutoutRequestFormat;
  disabled: boolean;
  onChanged(value: AiCutoutRequestFormat): void;
}) {
  return (
    <HStack spacing={10} disabled={props.disabled}>
      <Image
        systemName="arrow.left.arrow.right"
        font={16}
        foregroundStyle="#AF52DE"
        frame={{ width: 22 }}
      />
      <Picker
        title="图片请求格式"
        value={props.value}
        onChanged={(value: string) => {
          const next = AI_CUTOUT_REQUEST_FORMATS.find((item) => item === value);
          if (next) props.onChanged(next);
        }}
        pickerStyle="menu"
        frame={{ maxWidth: "infinity" }}
      >
        {AI_CUTOUT_REQUEST_FORMATS.map((format) => (
          <Text key={format} tag={format}>
            {aiCutoutRequestFormatLabel(format)}
          </Text>
        ))}
      </Picker>
    </HStack>
  );
}
