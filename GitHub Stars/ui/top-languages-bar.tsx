import {
  type Color,
  HStack,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
} from "scripting";
import type { GitHubLanguageStat } from "../types";

export function TopLanguagesBar(props: { languages: GitHubLanguageStat[] }) {
  const { languages } = props;
  if (!languages || languages.length === 0) return null;

  return (
    <VStack spacing={8} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack alignment="center">
        <Text font="footnote">Top Languages</Text>
        <Spacer />
      </HStack>

      {/* 彩色比例进度条 */}
      <HStack
        spacing={2}
        frame={{ maxWidth: "infinity", height: 8 }}
        clipShape={{
          type: "rect",
          cornerRadius: 4,
          style: "continuous",
        }}
      >
        {languages.map((l) => (
          <RoundedRectangle
            key={`bar-${l.name}`}
            cornerRadius={0}
            fill={(l.color as Color) || "#858585"}
            frame={{
              maxWidth: "infinity",
              height: 8,
            }}
          />
        ))}
      </HStack>

      {/* 语言与百分比图例 */}
      <HStack spacing={12} alignment="center">
        {languages.map((l) => (
          <HStack key={`leg-${l.name}`} spacing={4} alignment="center">
            <RoundedRectangle
              cornerRadius={3}
              fill={(l.color as Color) || "#858585"}
              frame={{ width: 6, height: 6 }}
            />
            <Text font="caption2" foregroundStyle="secondaryLabel">
              {`${l.name} ${l.percentage}%`}
            </Text>
          </HStack>
        ))}
      </HStack>
    </VStack>
  );
}
