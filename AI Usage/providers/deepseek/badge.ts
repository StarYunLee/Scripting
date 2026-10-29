import type { PlanBadgeRecipe } from "../badge-contract";
import { linear } from "../badge-contract";

/**
 * 余额型账号没有套餐名，徽章文字就是 API（planLabel）。
 * 彩色图标用于账户页，蓝色徽章内用白色模板轮廓保持对比度。
 */
export function resolveDeepseekBadge(label: string): PlanBadgeRecipe {
  return {
    text: label.trim() || "API",
    background: linear(["#2742AF", "#4D6BFE"]),
    foreground: "#FFFFFF",
    preserveLogoColor: false,
  };
}
