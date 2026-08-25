import { Rectangle, ZStack } from "scripting";
import type { DynamicShapeStyle, LinearGradient } from "scripting";
import type { BackgroundThemeId } from "../services/settings";

function layer(
  fill: DynamicShapeStyle & { light: LinearGradient; dark: LinearGradient },
) {
  return (
    <Rectangle fill={fill} ignoresSafeArea={true} allowsHitTesting={false} />
  );
}

function SystemDefaultBackground() {
  return (
    <Rectangle
      fill={{
        light: "systemGroupedBackground",
        dark: "systemGroupedBackground",
      }}
      ignoresSafeArea={true}
      allowsHitTesting={false}
    />
  );
}

function CoolBlueBackground() {
  return layer({
    light: {
      colors: ["#C8D4EE", "#C5D5EC", "#C1D6EB"],
      startPoint: "top",
      endPoint: "bottom",
    },
    dark: {
      colors: ["#2C2E4D", "#283045", "#253340"],
      startPoint: "topLeading",
      endPoint: "bottomTrailing",
    },
  });
}

function WarmPaperBackground() {
  return layer({
    light: {
      colors: ["#E8EDF0", "#DDE7E2", "#EFE2D2"],
      startPoint: "topLeading",
      endPoint: "bottomTrailing",
    },
    dark: {
      colors: ["#070914", "#11162A", "#20162D"],
      startPoint: "topLeading",
      endPoint: "bottomTrailing",
    },
  });
}

/** 雾霭：冷雾多层渐变，来自用户 AppTabBackground 配色。 */
function MistHazeBackground() {
  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Rectangle
        fill={{
          light: "systemGroupedBackground",
          dark: "systemGroupedBackground",
        }}
        ignoresSafeArea={true}
        allowsHitTesting={false}
      />

      {layer({
        light: {
          colors: ["#EDF4FA", "#F4EEF5", "#EEF6F8", "#F6F1EF"],
          startPoint: "topLeading",
          endPoint: "bottomTrailing",
        },
        dark: {
          colors: ["#0E1117", "#151B25", "#101817", "#18131A"],
          startPoint: "topLeading",
          endPoint: "bottomTrailing",
        },
      })}

      {layer({
        light: {
          colors: [
            "rgba(199,221,245,0.38)",
            "rgba(235,213,234,0.28)",
            "rgba(205,234,240,0.22)",
            "rgba(230,224,244,0.25)",
          ],
          startPoint: "topTrailing",
          endPoint: "bottomLeading",
        },
        dark: {
          colors: [
            "rgba(38,56,90,0.34)",
            "rgba(43,63,64,0.22)",
            "rgba(60,42,70,0.22)",
            "rgba(23,26,34,0.30)",
          ],
          startPoint: "topTrailing",
          endPoint: "bottomLeading",
        },
      })}

      {layer({
        light: {
          colors: [
            "rgba(199,221,245,0.28)",
            "rgba(235,213,234,0.19)",
            "rgba(205,234,240,0.17)",
            "rgba(230,224,244,0.20)",
          ],
          startPoint: "topLeading",
          endPoint: "bottomTrailing",
        },
        dark: {
          colors: [
            "rgba(58,36,65,0.18)",
            "rgba(36,53,90,0.20)",
            "rgba(29,74,73,0.15)",
            "rgba(21,23,29,0.18)",
          ],
          startPoint: "topLeading",
          endPoint: "bottomTrailing",
        },
      })}

      {layer({
        light: {
          colors: [
            "rgba(214,231,246,0.22)",
            "rgba(241,221,235,0.15)",
            "rgba(218,231,246,0.20)",
            "rgba(233,228,246,0.16)",
          ],
          startPoint: "topTrailing",
          endPoint: "bottomLeading",
        },
        dark: {
          colors: [
            "rgba(32,62,57,0.14)",
            "rgba(51,35,68,0.16)",
            "rgba(32,48,76,0.19)",
            "rgba(16,20,27,0.20)",
          ],
          startPoint: "topTrailing",
          endPoint: "bottomLeading",
        },
      })}

      {layer({
        light: {
          colors: [
            "rgba(255,255,255,0.12)",
            "rgba(255,255,255,0)",
            "rgba(221,238,242,0.06)",
            "rgba(0,0,0,0.04)",
          ],
          startPoint: "top",
          endPoint: "bottom",
        },
        dark: {
          colors: [
            "rgba(255,255,255,0.025)",
            "rgba(255,255,255,0)",
            "rgba(0,0,0,0.18)",
          ],
          startPoint: "top",
          endPoint: "bottom",
        },
      })}
    </ZStack>
  );
}

export function PageBackground(props: { theme?: BackgroundThemeId }) {
  if (props.theme === "system_default") return <SystemDefaultBackground />;
  if (props.theme === "cool_blue") return <CoolBlueBackground />;
  if (props.theme === "mist_haze") return <MistHazeBackground />;
  return <WarmPaperBackground />;
}
