import { HStack, Text } from "scripting";
import type { ProviderId } from "../models";
import { resolvePlanBadge } from "../providers/badge-registry";
import type { WidgetChromeStyle } from "../widget/chrome-style";
import { ProviderLogo } from "./ProviderLogo";

const BADGE_SIZES = {
  // App 页面端使用：纯文字胶囊，外部已有品牌 Logo 与名称
  regular: {
    showLogo: false,
    logo: 0,
    text: 10,
    spacing: 0,
    horizontalPadding: 7,
    verticalPadding: 3,
  },
  // 小组件专用：紧凑一体化胶囊，内置品牌 Logo + 套餐名称
  widget: {
    showLogo: true,
    logo: 12,
    text: 9.5,
    spacing: 4.5,
    horizontalPadding: 7,
    verticalPadding: 3.5,
  },
  // 小尺寸小组件专用
  "widget-small": {
    showLogo: true,
    logo: 11,
    text: 9,
    spacing: 4,
    horizontalPadding: 6,
    verticalPadding: 3,
  },
  // 多账号小组件格子：信息密度更高，给邮箱标识留出剩余宽度
  "widget-dense": {
    showLogo: true,
    logo: 9,
    text: 8,
    spacing: 3,
    horizontalPadding: 5,
    verticalPadding: 2,
  },
} as const;

export type PlanBadgeSize = keyof typeof BADGE_SIZES;

export function PlanBadge(props: {
  provider: ProviderId;
  label: string;
  size?: PlanBadgeSize;
  chromeStyle?: WidgetChromeStyle;
}) {
  const size = props.size ?? "regular";
  const recipe = resolvePlanBadge(props.provider, props.label);
  const layout = BADGE_SIZES[size];
  const text = recipe.text;
  const clearHomeScreen = size !== "regular" && props.chromeStyle === "clear";

  // 如果无文字且不展示 Logo，则不渲染
  if (!text && !layout.showLogo) {
    return null;
  }

  const keepOriginalLogo = clearHomeScreen || recipe.preserveLogoColor;
  const logo = !layout.showLogo ? null : keepOriginalLogo ? (
    <ProviderLogo provider={props.provider} size={layout.logo} />
  ) : (
    <ProviderLogo
      provider={props.provider}
      size={layout.logo}
      tint={recipe.foreground}
    />
  );
  const label = text ? (
    <Text
      fontDesign="default"
      fontWidth="standard"
      font={layout.text}
      fontWeight="bold"
      foregroundStyle={clearHomeScreen ? "label" : recipe.foreground}
      lineLimit={1}
      minScaleFactor={
        size === "widget-dense" ? 0.7 : layout.showLogo ? 0.75 : 1
      }
    >
      {text}
    </Text>
  ) : null;

  const spacing = layout.showLogo && text ? layout.spacing : 0;
  const padding = {
    horizontal: layout.horizontalPadding,
    vertical: layout.verticalPadding,
  };
  const clipShape = { type: "capsule" as const, style: "continuous" as const };

  if (clearHomeScreen) {
    return (
      <HStack
        spacing={spacing}
        padding={padding}
        layoutPriority={1}
        fixedSize={true}
      >
        {logo}
        {label}
      </HStack>
    );
  }

  return (
    <HStack
      spacing={spacing}
      padding={padding}
      background={recipe.background}
      clipShape={clipShape}
      layoutPriority={1}
      fixedSize={true}
    >
      {logo}
      {label}
    </HStack>
  );
}
