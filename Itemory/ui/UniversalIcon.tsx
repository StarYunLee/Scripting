import type { Color, VirtualNode } from "scripting";
import { Image, Text } from "scripting";

/**
 * 判断字符串是否是 Emoji（非 ASCII 英文 Symbol 名）
 */
export function isEmojiSymbol(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  // SF Symbols 全部由英文、数字、点号和短横线组成 (例如 "shippingbox.fill", "laptopcomputer")
  // 包含非 ASCII 字符或超出基本符号集范围的即为 Emoji
  return /[^\u0020-\u007E]/.test(symbol);
}

/**
 * 统一渲染物品或分类图标：
 * - 如果是 Emoji，以彩色原生字体高清渲染；
 * - 如果是 SF Symbol，使用原生 Image systemName 渲染。
 */
export function UniversalIcon(props: {
  symbol: string;
  size?: number;
  color?: Color;
}): VirtualNode {
  const { symbol, size = 24, color = "accentColor" } = props;
  if (isEmojiSymbol(symbol)) {
    return (
      <Text
        font={Math.round(size * 0.9)}
        multilineTextAlignment="center"
        frame={{ width: size, height: size, alignment: "center" }}
      >
        {symbol}
      </Text>
    );
  }

  return (
    <Image
      systemName={symbol}
      font={Math.round(size * 0.8)}
      foregroundStyle={color}
      frame={{ width: size, height: size, alignment: "center" }}
    />
  );
}
