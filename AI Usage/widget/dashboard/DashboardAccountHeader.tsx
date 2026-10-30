import { HStack, Image, Spacer, Text } from "scripting";
import { PlanBadge } from "../../components/PlanBadge";
import { providerMeta, type ProviderId } from "../../models";
import type { WidgetChromeStyle } from "../chrome-style";
import { widgetTheme as C } from "../transparent";

/** Stable type size and a reserved identity column, regardless of plan-label length. */
export function DashboardAccountHeader(props: {
  provider: ProviderId;
  planLabel: string | null;
  accountLabel: string;
  showAccountLabel: boolean;
  width: number;
  hasError: boolean;
  chromeStyle?: WidgetChromeStyle;
}) {
  const labelWidth = Math.min(96, Math.max(52, Math.round(props.width * 0.36)));
  return (
    <HStack spacing={5} frame={{ width: props.width }}>
      <PlanBadge provider={props.provider}
        label={props.provider === "deepseek" ? "DeepSeek" : props.planLabel || providerMeta(props.provider).title}
        size="widget-dense" chromeStyle={props.chromeStyle}
        flexible={props.showAccountLabel} />
      <Spacer minLength={0} />
      {props.showAccountLabel ? (
        <Text font={9} fontWeight="medium" foregroundStyle={C.secondary}
          lineLimit={1} truncationMode="middle" minScaleFactor={1}
          multilineTextAlignment="trailing" frame={{ width: labelWidth, alignment: "trailing" }}
          layoutPriority={1}
          {...(C.textShadow ? { shadow: C.textShadow } : {})}>
          {props.accountLabel}
        </Text>
      ) : null}
      {props.hasError ? <Image systemName="exclamationmark.triangle.fill" font={8} foregroundStyle={C.warn} /> : null}
    </HStack>
  );
}
