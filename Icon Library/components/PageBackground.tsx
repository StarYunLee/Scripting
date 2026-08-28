import { Rectangle } from "scripting";

/**
 * 全局自适应背景：浅色融合系统分组底色与轻冷色，深色使用冷蓝渐变。
 * DynamicShapeStyle 会随系统明暗模式自动切换，无需保存用户配置。
 */
export function PageBackground() {
  return (
    <Rectangle
      fill={{
        light: {
          colors: ["systemGroupedBackground", "#EEF3FB", "#E7EEF9"],
          startPoint: "top",
          endPoint: "bottomTrailing",
        },
        dark: {
          colors: ["#111827", "#132238", "#0D1728"],
          startPoint: "topLeading",
          endPoint: "bottomTrailing",
        },
      }}
      ignoresSafeArea={true}
      allowsHitTesting={false}
    />
  );
}
