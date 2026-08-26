import {
  Button,
  type Color,
  HStack,
  Image,
  Menu,
  ProgressView,
  RoundedRectangle,
  ScrollView,
  Spacer,
  Text,
  VStack,
  useState,
} from "scripting";
import type { GitHubContributionCalendar, GitHubUser } from "../types";
import type { GitHubDataStore } from "../services/data-store";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CELL_SIZE = 10;
const CELL_SPACING = 3;

export function ContributionGraph(props: {
  user: GitHubUser;
  store: GitHubDataStore;
}) {
  const { user, store } = props;
  const currentYear = new Date().getFullYear();
  const availableYears =
    user.contributionYears && user.contributionYears.length > 0
      ? user.contributionYears
      : [currentYear];

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loadingYear, setLoadingYear] = useState(false);

  const calendar: GitHubContributionCalendar | null =
    user.contributionsByYear?.[selectedYear] ?? null;

  async function handleSelectYear(year: number) {
    if (year === selectedYear) return;
    setSelectedYear(year);
    if (user.contributionsByYear?.[year]) return;

    setLoadingYear(true);
    try {
      await store.loadYearContributions(year);
    } catch {
      // 错误由 store 统一抛出并静默降级
    } finally {
      setLoadingYear(false);
    }
  }

  const weeks = calendar?.weeks ?? [];
  const colors: Color[] =
    calendar?.colors && calendar.colors.length > 0
      ? (calendar.colors as Color[])
      : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

  // 计算每个月第一周的月份名称
  let lastMonth = -1;
  const monthHeaders = weeks.map((week) => {
    const sampleDay = week.contributionDays.find((d) => Boolean(d.date));
    if (!sampleDay || !sampleDay.date) return "";
    const month = new Date(sampleDay.date).getMonth();
    if (month !== lastMonth) {
      lastMonth = month;
      return MONTH_NAMES[month] ?? "";
    }
    return "";
  });

  return (
    <VStack spacing={10} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      {/* 顶部标题行：左侧贡献总数，右侧精致小玻璃胶囊年份菜单 */}
      <HStack alignment="center">
        <Text font="footnote">
          {calendar
            ? `${calendar.totalContributions.toLocaleString()} contributions in ${selectedYear}`
            : `Contributions in ${selectedYear}`}
        </Text>
        <Spacer />
        {loadingYear ? (
          <ProgressView
            controlSize="mini"
            frame={{ width: 14, height: 14 }}
            padding={{ trailing: 4 }}
          />
        ) : null}

        {/* 精致小玻璃卡片年份选择器 */}
        <Menu
          label={
            <HStack
              spacing={4}
              alignment="center"
              padding={{ horizontal: 8, vertical: 4 }}
              background="quaternarySystemFill"
              clipShape={{
                type: "rect",
                cornerRadius: 8,
                style: "continuous",
              }}
            >
              <Text font="caption2" foregroundStyle="secondaryLabel">
                {`${selectedYear}`}
              </Text>
              <Image
                systemName="chevron.up.chevron.down"
                font="caption2"
                foregroundStyle="secondaryLabel"
              />
            </HStack>
          }
        >
          {availableYears.map((y) => (
            <Button
              key={`year-${y}`}
              title={`${y}`}
              action={() => {
                void handleSelectYear(y);
              }}
            />
          ))}
        </Menu>
      </HStack>

      {calendar ? (
        <ScrollView axes="horizontal" frame={{ maxWidth: "infinity" }}>
          <HStack spacing={6} alignment="top" padding={{ vertical: 4 }}>
            {/* 左侧固定星期标签：严格对齐 Mon(1), Wed(3), Fri(5) */}
            <VStack spacing={CELL_SPACING}>
              {/* 顶部月份占位 14pt */}
              <Text font="caption2" frame={{ height: 14 }}>
                {" "}
              </Text>
              {/* Sun (0) */}
              <Text font="caption2" frame={{ height: CELL_SIZE }}>
                {" "}
              </Text>
              {/* Mon (1) */}
              <Text
                font="caption2"
                foregroundStyle="secondaryLabel"
                frame={{ height: CELL_SIZE }}
              >
                Mon
              </Text>
              {/* Tue (2) */}
              <Text font="caption2" frame={{ height: CELL_SIZE }}>
                {" "}
              </Text>
              {/* Wed (3) */}
              <Text
                font="caption2"
                foregroundStyle="secondaryLabel"
                frame={{ height: CELL_SIZE }}
              >
                Wed
              </Text>
              {/* Thu (4) */}
              <Text font="caption2" frame={{ height: CELL_SIZE }}>
                {" "}
              </Text>
              {/* Fri (5) */}
              <Text
                font="caption2"
                foregroundStyle="secondaryLabel"
                frame={{ height: CELL_SIZE }}
              >
                Fri
              </Text>
              {/* Sat (6) */}
              <Text font="caption2" frame={{ height: CELL_SIZE }}>
                {" "}
              </Text>
            </VStack>

            {/* 右侧 52 周严格等宽色块网格 */}
            <HStack spacing={CELL_SPACING}>
              {weeks.map((week, weekIdx) => {
                const monthLabel = monthHeaders[weekIdx] ?? "";
                const daysByWeekday = new Array(7).fill(null);
                for (const d of week.contributionDays) {
                  if (d.weekday >= 0 && d.weekday < 7) {
                    daysByWeekday[d.weekday] = d;
                  }
                }

                return (
                  <VStack
                    spacing={CELL_SPACING}
                    key={`w-${weekIdx}`}
                    frame={{ width: CELL_SIZE }}
                  >
                    {/* 顶部月份 */}
                    <Text
                      font="caption2"
                      foregroundStyle="secondaryLabel"
                      lineLimit={1}
                      fixedSize={{ horizontal: true, vertical: false }}
                      frame={{
                        width: CELL_SIZE,
                        height: 14,
                        alignment: "leading",
                      }}
                    >
                      {monthLabel}
                    </Text>

                    {/* 7 天色块 */}
                    {daysByWeekday.map((day, weekdayIdx) => {
                      if (!day) {
                        return (
                          <RoundedRectangle
                            key={`empty-${weekdayIdx}`}
                            cornerRadius={2}
                            fill="clear"
                            frame={{ width: CELL_SIZE, height: CELL_SIZE }}
                          />
                        );
                      }
                      return (
                        <RoundedRectangle
                          key={day.date || `d-${weekdayIdx}`}
                          cornerRadius={2}
                          fill={(day.color as Color) || colors[0]}
                          frame={{ width: CELL_SIZE, height: CELL_SIZE }}
                        />
                      );
                    })}
                  </VStack>
                );
              })}
            </HStack>
          </HStack>
        </ScrollView>
      ) : (
        <HStack
          frame={{ minHeight: 100, maxWidth: "infinity", alignment: "center" }}
        >
          <ProgressView />
        </HStack>
      )}

      {/* 底部 Less / More 原生图例 */}
      <HStack spacing={4} alignment="center">
        <Spacer />
        <Text font="caption2" foregroundStyle="secondaryLabel">
          Less
        </Text>
        {colors.map((c, i) => (
          <RoundedRectangle
            key={`c-${i}`}
            cornerRadius={1.5}
            fill={c}
            frame={{ width: 8, height: 8 }}
          />
        ))}
        <Text font="caption2" foregroundStyle="secondaryLabel">
          More
        </Text>
      </HStack>
    </VStack>
  );
}
