import {
  Bar1DChart,
  BarStackChart,
  Button,
  Chart,
  ContentUnavailableView,
  Divider,
  DonutChart,
  EnvironmentValuesReader,
  GeometryReader,
  HStack,
  Image,
  List,
  Menu,
  Navigation,
  NavigationStack,
  Picker,
  Rectangle,
  Spacer,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
  ZStack,
  type Color,
  useEffect,
  useState,
} from "scripting";
import { formatMinorMoney } from "../services/format";
import { safeAddMinor } from "../domain/validation";
import { ITEM_STATUS_META } from "../models/types";
import {
  getStatisticsReport,
  type StatisticsCategory,
  type StatisticsExpenseKind,
  type StatisticsPeriod,
  type StatisticsReport,
  type StatisticsRankingItem,
  type StatisticsStatusCount,
} from "../services/statistics";
import { subscribeDataChanges } from "../services/change-store";
import { NativeGroup, NativeNoteRow } from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";
import { isEmojiSymbol } from "../ui/UniversalIcon";

function formatDays(value: number | null): string {
  if (value === null) return "天数不可用";
  if (value >= 365) return `${(value / 365).toFixed(1)} 年`;
  return `${value} 天`;
}

function formatNetCost(value: number | null): string {
  if (value === null) return "金额不可用";
  return value < 0
    ? `+${formatMinorMoney(Math.abs(value), true)}`
    : formatMinorMoney(value, true);
}

function aggregateMoney(value: number | null): string {
  return value === null ? "金额不可用" : formatMinorMoney(value, true);
}

function formatWholeYuan(minor: number): string {
  return `¥${Math.round(minor / 100)}`;
}

function percent(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function cashFlowAxisLabel(key: string): string {
  if (/^\d{4}$/.test(key)) return key;
  const month = Number(key.slice(5, 7));
  return Number.isFinite(month) && month > 0 ? String(month) : key;
}

const CASH_FLOW_VISIBLE_BUCKETS = 6;
const CASH_FLOW_REGULAR_VISIBLE_BUCKETS = 12;
const RANKING_COLORS: Color[] = [
  "#D99A00",
  "#9AA0AA",
  "#B87333",
  "#5F7896",
  "#7D838C",
];

function StatMetric(props: {
  label: string;
  value: string;
  color?: Color;
  centered?: boolean;
}) {
  const contentAlignment = props.centered
    ? ("center" as const)
    : ("leading" as const);
  return (
    <VStack
      alignment={contentAlignment}
      spacing={3}
      frame={{ maxWidth: "infinity", alignment: contentAlignment }}
    >
      <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1}>
        {props.label}
      </Text>
      <Text
        font={16}
        fontWeight="semibold"
        foregroundStyle={props.color}
        lineLimit={1}
        minScaleFactor={0.65}
      >
        {props.value}
      </Text>
    </VStack>
  );
}

type StatusChartItem = {
  key: string;
  name: string;
  count: number;
  color: Color;
};

function StatusAnalysisCard(props: {
  statuses: StatisticsStatusCount[];
  period?: StatisticsPeriod;
}) {
  const items: StatusChartItem[] = props.statuses
    .filter((status) => status.count > 0)
    .map((status) => ({
      key: status.key,
      name: status.label,
      count: status.count,
      color: status.color as Color,
    }));
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);
  if (items.length === 0 || totalCount <= 0) {
    return (
      <NativeNoteRow
        text={
          props.period && props.period !== "all"
            ? "该年度没有购入物品记录。"
            : "添加第一件物品后，这里会显示状态分布。"
        }
      />
    );
  }
  const centerAmount = `${totalCount} 件`;
  const centerAmountFont = centerAmount.length >= 6 ? 16 : 18;
  const yearSuffix =
    props.period && props.period !== "all" ? ` (${props.period}年购入)` : "";
  return (
    <VStack
      spacing={14}
      padding={{ top: 14, bottom: 14, leading: 12, trailing: 12 }}
      frame={{ maxWidth: "infinity" }}
    >
      <HStack spacing={10} frame={{ maxWidth: "infinity" }} alignment="center">
        <Text
          font={17}
          fontWeight="semibold"
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {`状态分布${yearSuffix}`}
        </Text>
        <Text
          font="caption"
          foregroundStyle="secondaryLabel"
          frame={{ alignment: "trailing" }}
        >
          {totalCount} 件
        </Text>
      </HStack>

      <HStack spacing={8} frame={{ maxWidth: "infinity" }} alignment="center">
        <ZStack alignment="center" frame={{ width: 140, height: 200 }}>
          <Chart frame={{ width: 140, height: 200 }} chartLegend="hidden">
            <DonutChart
              marks={items.map((item) => ({
                category: item.name,
                value: item.count,
                foregroundStyle: item.color,
                innerRadius: { type: "ratio" as const, value: 0.6 },
                outerRadius: { type: "inset" as const, value: 6 },
                angularInset: 1,
              }))}
            />
          </Chart>
          <VStack alignment="center" spacing={1}>
            <Text
              font={centerAmountFont}
              fontWeight="semibold"
              lineLimit={1}
              minScaleFactor={0.5}
            >
              {centerAmount}
            </Text>
            <Text font="caption" foregroundStyle="secondaryLabel">
              物品总数
            </Text>
          </VStack>
        </ZStack>

        <VStack
          alignment="leading"
          spacing={3}
          frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}
        >
          {items.map((item) => (
            <HStack
              key={`${item.key}-${item.color}`}
              spacing={2}
              padding={{ vertical: 2, horizontal: 6 }}
              frame={{ minHeight: 28, maxWidth: "infinity" }}
              background={{
                style: "rgba(142, 142, 147, 0.08)",
                shape: {
                  type: "rect",
                  cornerRadius: 8,
                  style: "continuous",
                },
              }}
            >
              <Image
                systemName="circle.fill"
                font={8}
                foregroundStyle={item.color}
                frame={{ width: 10 }}
              />
              <Text
                font={12}
                frame={{ width: 50, alignment: "leading" }}
                lineLimit={1}
                minScaleFactor={0.55}
              >
                {item.name}
              </Text>
              <Text
                font={12}
                fontWeight="semibold"
                foregroundStyle={item.color}
                lineLimit={1}
                frame={{ width: 54, alignment: "trailing" }}
              >
                {item.count} 件
              </Text>
              <Text
                font={10}
                foregroundStyle="secondaryLabel"
                frame={{ width: 30, alignment: "trailing" }}
              >
                {percent(item.count, totalCount)}
              </Text>
            </HStack>
          ))}
        </VStack>
      </HStack>
    </VStack>
  );
}

const CATEGORY_CHART_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#AF52DE",
  "#FF2D55",
  "#5856D6",
  "#00C7BE",
  "#FFCC00",
] as const;
const OTHER_CATEGORY_COLOR = "#8E8E93" as Color;
const CATEGORY_CHART_LIMIT = 8;

type CategoryChartItem = {
  name: string;
  amountMinor: number;
  itemCount: number;
  color: Color;
};

type CategoryChartData = {
  unavailable?: boolean;
  items: CategoryChartItem[];
  categoryCount: number;
};

function buildCategoryChartData(
  categories: StatisticsCategory[],
): CategoryChartData {
  // 图形及“其余分类”也不能在 UI 中进行不安全的聚合。
  try {
    categories.reduce((sum, category) => {
      if (category.knownExpenseMinor === null) throw new Error("unavailable");
      return safeAddMinor(sum, category.knownExpenseMinor, "分类图表");
    }, 0);
  } catch {
    return { unavailable: true, categoryCount: categories.length, items: [] };
  }
  const active = categories
    .filter((category): category is StatisticsCategory & { knownExpenseMinor: number } =>
      category.knownExpenseMinor !== null && category.knownExpenseMinor > 0)
    .slice();
  if (active.length <= CATEGORY_CHART_LIMIT) {
    return {
      categoryCount: active.length,
      items: active.map((category, index) => ({
        name: category.name,
        amountMinor: category.knownExpenseMinor,
        itemCount: category.itemCount,
        color: CATEGORY_CHART_COLORS[index] as Color,
      })),
    };
  }
  const visible = active
    .slice(0, CATEGORY_CHART_LIMIT - 1)
    .map((category, index) => ({
      name: category.name,
      amountMinor: category.knownExpenseMinor,
      itemCount: category.itemCount,
      color: CATEGORY_CHART_COLORS[index] as Color,
    }));
  const other = active.slice(CATEGORY_CHART_LIMIT - 1).reduce(
    (result, category) => ({
      amountMinor: result.amountMinor + category.knownExpenseMinor,
      itemCount: result.itemCount + category.itemCount,
    }),
    { amountMinor: 0, itemCount: 0 },
  );
  return {
    categoryCount: active.length,
    items: [
      ...visible,
      {
        name: "其余分类",
        amountMinor: other.amountMinor,
        itemCount: other.itemCount,
        color: OTHER_CATEGORY_COLOR,
      },
    ],
  };
}

function CategoryAnalysisCard(props: {
  data: CategoryChartData;
  period?: StatisticsPeriod;
}) {
  const { items } = props.data;
  if (props.data.unavailable) return <NativeNoteRow text="分类投入金额汇总超出安全范围，图表暂不可用；物品件数仍保留。" />;
  const totalMinor = items.reduce((sum, item) => sum + item.amountMinor, 0);
  if (items.length === 0 || totalMinor <= 0) {
    return <NativeNoteRow text="所选期间没有分类投入记录。" />;
  }
  const centerAmount = formatWholeYuan(totalMinor);
  const centerAmountFont =
    centerAmount.length >= 8 ? 14 : centerAmount.length >= 6 ? 16 : 18;
  const yearSuffix =
    props.period && props.period !== "all" ? ` (${props.period}年)` : "";
  return (
    <VStack
      spacing={14}
      padding={{ top: 14, bottom: 14, leading: 12, trailing: 12 }}
      frame={{ maxWidth: "infinity" }}
    >
      <HStack spacing={10} frame={{ maxWidth: "infinity" }} alignment="center">
        <Text
          font={17}
          fontWeight="semibold"
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {`分类投入${yearSuffix}`}
        </Text>
        <Text
          font="caption"
          foregroundStyle="secondaryLabel"
          frame={{ alignment: "trailing" }}
        >
          {props.data.categoryCount} 个分类
        </Text>
      </HStack>
      <HStack spacing={8} frame={{ maxWidth: "infinity" }} alignment="center">
        <ZStack alignment="center" frame={{ width: 140, height: 200 }}>
          <Chart frame={{ width: 140, height: 200 }} chartLegend="hidden">
            <DonutChart
              marks={items.map((item) => ({
                category: item.name,
                value: item.amountMinor,
                foregroundStyle: item.color,
                innerRadius: { type: "ratio" as const, value: 0.6 },
                outerRadius: { type: "inset" as const, value: 6 },
                angularInset: 1,
              }))}
            />
          </Chart>
          <VStack alignment="center" spacing={1}>
            <Text
              font={centerAmountFont}
              fontWeight="semibold"
              lineLimit={1}
              minScaleFactor={0.5}
            >
              {centerAmount}
            </Text>
            <Text font="caption" foregroundStyle="secondaryLabel">
              物品投入
            </Text>
          </VStack>
        </ZStack>

        <VStack
          alignment="leading"
          spacing={3}
          frame={{ minWidth: 0, maxWidth: "infinity", alignment: "leading" }}
        >
          {items.map((item) => (
            <HStack
              key={`${item.name}-${item.color}`}
              spacing={2}
              padding={{ vertical: 2, horizontal: 6 }}
              frame={{ minHeight: 28, maxWidth: "infinity" }}
              background={{
                style: "rgba(142, 142, 147, 0.08)",
                shape: {
                  type: "rect",
                  cornerRadius: 8,
                  style: "continuous",
                },
              }}
            >
              <Image
                systemName="circle.fill"
                font={8}
                foregroundStyle={item.color}
                frame={{ width: 10 }}
              />
              <Text
                font={12}
                frame={{ width: 50, alignment: "leading" }}
                lineLimit={1}
                minScaleFactor={0.55}
              >
                {item.name}
              </Text>
              <Text
                font={12}
                fontWeight="semibold"
                foregroundStyle={item.color}
                lineLimit={1}
                frame={{ width: 54, alignment: "trailing" }}
              >
                {formatWholeYuan(item.amountMinor)}
              </Text>
              <Text
                font={10}
                foregroundStyle="secondaryLabel"
                frame={{ width: 30, alignment: "trailing" }}
              >
                {percent(item.amountMinor, totalMinor)}
              </Text>
            </HStack>
          ))}
        </VStack>
      </HStack>
    </VStack>
  );
}

function ExpenseDistributionChart(props: { entries: StatisticsExpenseKind[] }) {
  if (props.entries.some((entry) => entry.amountMinor === null)) {
    return <NativeNoteRow text="额外支出金额汇总超出安全范围，图表暂不可用。" />;
  }
  try {
    props.entries.reduce((sum, entry) => safeAddMinor(sum, entry.amountMinor!, "额外支出图表"), 0);
  } catch {
    return <NativeNoteRow text="额外支出金额汇总超出安全范围，图表暂不可用。" />;
  }
  // 已显式排除不可用金额，不向图表注入占位 0。
  const entries = props.entries as (StatisticsExpenseKind & { amountMinor: number })[];
  const colorScale = entries.reduce<Record<string, Color>>(
    (scale, entry) => {
      scale[entry.label] = entry.color as Color;
      return scale;
    },
    {},
  );
  const marks = entries.map((entry) => ({
    category: entry.label,
    value: entry.amountMinor / 100,
    cornerRadius: 9,
  }));
  return (
    <VStack
      spacing={0}
      padding={{ top: 8, bottom: 4 }}
      frame={{ maxWidth: "infinity" }}
    >
      <Chart
        frame={{ maxWidth: 520, height: 42 }}
        chartLegend="hidden"
        chartXAxis="hidden"
        chartYAxis="hidden"
        chartForegroundStyleScale={colorScale}
        clipShape={{ type: "rect", cornerRadius: 10 }}
      >
        <Bar1DChart marks={marks} />
      </Chart>
    </VStack>
  );
}

function ExpenseRow(props: { entry: StatisticsExpenseKind }) {
  return (
    <HStack
      spacing={8}
      padding={{ vertical: 4 }}
      frame={{ maxWidth: "infinity" }}
    >
      <HStack
        spacing={7}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        <Image
          systemName="circle.fill"
          font={8}
          foregroundStyle={props.entry.color as Color}
          frame={{ width: 10 }}
        />
        <Text
          font={16}
          lineLimit={1}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {props.entry.label}
        </Text>
      </HStack>
      <Text
        font="caption"
        foregroundStyle="secondaryLabel"
        frame={{ width: 42, alignment: "trailing" }}
      >
        {props.entry.count} 笔
      </Text>
      <Text
        font={16}
        fontWeight="semibold"
        foregroundStyle={props.entry.color as Color}
        lineLimit={1}
        minScaleFactor={0.65}
        frame={{ width: 78, alignment: "trailing" }}
      >
        {aggregateMoney(props.entry.amountMinor)}
      </Text>
    </HStack>
  );
}

function ExpenseAnalysisBlock(props: {
  entries: StatisticsExpenseKind[];
  period?: StatisticsPeriod;
}) {
  if (props.entries.length === 0) {
    return (
      <NativeNoteRow text="所选期间没有配件、保养、维修、升级等额外支出记录。" />
    );
  }
  const yearSuffix =
    props.period && props.period !== "all" ? ` (${props.period}年)` : "";
  return (
    <VStack
      spacing={4}
      padding={{ top: 14, bottom: 12, leading: 12, trailing: 12 }}
      frame={{ maxWidth: "infinity" }}
    >
      <HStack spacing={10} frame={{ maxWidth: "infinity" }} alignment="center">
        <Text
          font={17}
          fontWeight="semibold"
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {`额外支出${yearSuffix}`}
        </Text>
        <Text
          font="caption"
          foregroundStyle="secondaryLabel"
          frame={{ alignment: "trailing" }}
        >
          不含购入
        </Text>
      </HStack>
      <ExpenseDistributionChart entries={props.entries} />
      {props.entries.map((entry) => (
        <ExpenseRow key={entry.key} entry={entry} />
      ))}
    </VStack>
  );
}

function HoldingDurationRows(props: {
  buckets: StatisticsReport["lifecycle"]["holdingBuckets"];
}) {
  const colors = [
    "#34C759",
    "#00C7BE",
    "#007AFF",
    "#5856D6",
    "#AF52DE",
  ] as const;
  const maxCount = Math.max(1, ...props.buckets.map((bucket) => bucket.count));
  return (
    <VStack
      spacing={4}
      padding={{ top: 8, bottom: 10 }}
      frame={{ maxWidth: "infinity" }}
    >
      {props.buckets.map((bucket, index) => {
        const color = colors[index % colors.length] as Color;
        const ratio = Math.min(1, Math.max(0, bucket.count / maxCount));
        return (
          <VStack
            key={bucket.label}
            spacing={4}
            padding={{ vertical: 3 }}
            frame={{ maxWidth: "infinity" }}
          >
            <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
              <Text
                font={15}
                lineLimit={1}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
              >
                {bucket.label}
              </Text>
              <Text
                font={15}
                fontWeight="semibold"
                foregroundStyle={color}
                frame={{ width: 48, alignment: "trailing" }}
              >
                {bucket.count} 件
              </Text>
            </HStack>
            <GeometryReader frame={{ height: 7, maxWidth: "infinity" }}>
              {(proxy) => (
                <ZStack
                  alignment="leading"
                  frame={{ height: 7, maxWidth: "infinity" }}
                >
                  <Rectangle
                    fill="rgba(142, 142, 147, 0.16)"
                    frame={{ height: 7, maxWidth: "infinity" }}
                    clipShape={{ type: "rect", cornerRadius: 4 }}
                  />
                  {ratio > 0 ? (
                    <Rectangle
                      fill={color}
                      frame={{
                        width: Math.max(4, proxy.size.width * ratio),
                        height: 7,
                      }}
                      clipShape={{ type: "rect", cornerRadius: 4 }}
                    />
                  ) : null}
                </ZStack>
              )}
            </GeometryReader>
          </VStack>
        );
      })}
    </VStack>
  );
}

function CashFlowChart(props: {
  buckets: StatisticsReport["cashFlow"]["buckets"];
}) {
  if (props.buckets.some((bucket) => bucket.expenseMinor === null || bucket.incomeMinor === null)) {
    return <NativeNoteRow text="部分现金流桶金额汇总超出安全范围，趋势图暂不可用；其他指标仍可查看。" />;
  }
  const buckets = props.buckets as (StatisticsReport["cashFlow"]["buckets"][number] & { expenseMinor: number; incomeMinor: number })[];
  const axisLabels = buckets.map((bucket) =>
    cashFlowAxisLabel(bucket.key),
  );
  const marks = buckets.flatMap((bucket, index) => [
    {
      label: axisLabels[index],
      value: bucket.expenseMinor / 100,
      category: "支出",
      foregroundStyle: "#007AFF" as Color,
      cornerRadius: 3,
    },
    {
      label: axisLabels[index],
      value: bucket.incomeMinor / 100,
      category: "收入",
      foregroundStyle: "#34C759" as Color,
      cornerRadius: 3,
    },
  ]);

  return (
    <EnvironmentValuesReader keys={["horizontalSizeClass"]}>
      {(environment) => {
        const visibleBucketCount = Math.min(
          axisLabels.length,
          environment.horizontalSizeClass === "regular"
            ? CASH_FLOW_REGULAR_VISIBLE_BUCKETS
            : CASH_FLOW_VISIBLE_BUCKETS,
        );
        const initialScrollLabel =
          axisLabels[
            Math.max(0, axisLabels.length - visibleBucketCount)
          ] ?? "";
        return (
          <Chart
            frame={{ height: 210 }}
            chartXScale={{
              domain: axisLabels,
              type: "category",
            }}
            chartScrollableAxes="horizontal"
            chartXVisibleDomain={visibleBucketCount}
            chartScrollPositionX={initialScrollLabel}
            chartXAxis={{
              values: "automatic",
              gridLine: false,
              tick: false,
              valueLabel: {
                centered: true,
                collisionResolution: "disabled",
                offsetsMarks: false,
              },
            }}
            chartLegend="hidden"
            chartYAxis={{
              position: "leading",
              valueLabel: {
                format: "number",
                horizontalSpacing: 2,
                offsetsMarks: false,
              },
              tick: false,
              gridLine: true,
            }}
          >
            <BarStackChart marks={marks} />
          </Chart>
        );
      }}
    </EnvironmentValuesReader>
  );
}

function RankingThumb(props: { item: StatisticsRankingItem }) {
  if (props.item.coverPath && FileManager.existsSync(props.item.coverPath)) {
    return (
      <Image
        filePath={props.item.coverPath}
        resizable
        renderingMode="original"
        frame={{ width: 34, height: 34 }}
        clipShape={{ type: "rect", cornerRadius: 8 }}
      />
    );
  }
  return (
    <VStack alignment="center" frame={{ width: 34, height: 34 }}>
      {isEmojiSymbol(props.item.iconSymbol) ? (
        <Text
          font={22}
          multilineTextAlignment="center"
          frame={{ width: 34, height: 34, alignment: "center" }}
        >
          {props.item.iconSymbol}
        </Text>
      ) : (
        <Image
          systemName={props.item.iconSymbol}
          font={24}
          foregroundStyle="#007AFF"
          frame={{ width: 34, height: 34 }}
        />
      )}
    </VStack>
  );
}

function RankingRow(props: {
  item: StatisticsRankingItem;
  rank: number;
  mode: "expense" | "daily" | "holding";
}) {
  const statusMeta = ITEM_STATUS_META[props.item.status];
  const isDaily = props.mode === "daily";
  const isHolding = props.mode === "holding";
  const rankColor: Color = RANKING_COLORS[props.rank - 1] ?? "secondaryLabel";
  return (
    <HStack
      spacing={10}
      padding={{ vertical: 9 }}
      frame={{ maxWidth: "infinity" }}
    >
      <Text
        font="subheadline"
        fontWeight="bold"
        foregroundStyle={rankColor}
        frame={{ width: 16, alignment: "center" }}
      >
        {props.rank}
      </Text>
      <RankingThumb item={props.item} />
      <VStack
        alignment="leading"
        spacing={4}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        <Text lineLimit={1}>{props.item.name}</Text>
        <HStack
          spacing={5}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          <Text
            font={11}
            foregroundStyle="white"
            padding={{ vertical: 2, horizontal: 6 }}
            background={statusMeta.color}
            clipShape={{ type: "rect", cornerRadius: 4 }}
            lineLimit={1}
          >
            {statusMeta.label}
          </Text>
          {!isHolding ? (
            <Text
              font="caption2"
              foregroundStyle="secondaryLabel"
              lineLimit={1}
            >
              陪伴 {formatDays(props.item.holdingDays)}
            </Text>
          ) : null}
        </HStack>
      </VStack>
      <VStack
        alignment="trailing"
        spacing={2}
        frame={{ minWidth: 78, alignment: "trailing" }}
      >
        <Text
          font="subheadline"
          fontWeight="semibold"
          foregroundStyle="label"
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {isHolding
            ? formatDays(props.item.holdingDays)
            : `${formatMinorMoney(props.item.amountMinor, true)}${isDaily ? "/天" : ""}`}
        </Text>
        {isDaily && props.item.purchaseAmountMinor !== null ? (
          <Text
            font="caption2"
            foregroundStyle="secondaryLabel"
            lineLimit={1}
            minScaleFactor={0.65}
          >
            购入 {formatMinorMoney(props.item.purchaseAmountMinor, true)}
          </Text>
        ) : null}
      </VStack>
    </HStack>
  );
}

function RankingCardHeader(props: {
  title: string;
  order: "desc" | "asc";
  onToggle: (order: "desc" | "asc") => void;
}) {
  return (
    <HStack
      spacing={8}
      alignment="center"
      padding={{ top: 12, bottom: 6 }}
      frame={{ maxWidth: "infinity" }}
    >
      <Text font="headline" fontWeight="bold">
        {props.title}
      </Text>
      <Spacer />
      <Picker
        title="排序"
        value={props.order}
        onChanged={(value: string) => props.onToggle(value as "desc" | "asc")}
        pickerStyle="segmented"
        frame={{ width: 120 }}
      >
        <Text tag="desc">最高</Text>
        <Text tag="asc">最低</Text>
      </Picker>
    </HStack>
  );
}

function PlainCardHeader(props: { title: string; detail?: string }) {
  return (
    <HStack
      spacing={8}
      alignment="center"
      padding={{ top: 12, bottom: 6 }}
      frame={{ maxWidth: "infinity" }}
    >
      <Text font="headline" fontWeight="bold">
        {props.title}
      </Text>
      <Spacer />
      {props.detail ? (
        <Text font="caption" foregroundStyle="secondaryLabel">
          {props.detail}
        </Text>
      ) : null}
    </HStack>
  );
}

function OverviewFinancialGrid(props: {
  expenseMinor: number | null;
  incomeMinor: number | null;
  thirdMetricMinor: number | null;
  expenseLabel: string;
  incomeLabel: string;
  thirdMetricLabel: string;
}) {
  return (
    <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
      <VStack
        alignment="center"
        spacing={4}
        frame={{ maxWidth: "infinity", alignment: "center" }}
      >
        <HStack spacing={4} alignment="center">
          <Image
            systemName="arrow.up.circle.fill"
            font={11}
            foregroundStyle="#007AFF"
          />
          <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>
            {props.expenseLabel}
          </Text>
        </HStack>
        <Text
          font={16}
          fontWeight="semibold"
          foregroundStyle="label"
          lineLimit={1}
          minScaleFactor={0.65}
          multilineTextAlignment="center"
        >
          {aggregateMoney(props.expenseMinor)}
        </Text>
      </VStack>

      <VStack
        alignment="center"
        spacing={4}
        frame={{ maxWidth: "infinity", alignment: "center" }}
      >
        <HStack spacing={4} alignment="center">
          <Image
            systemName="arrow.down.circle.fill"
            font={11}
            foregroundStyle="#34C759"
          />
          <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>
            {props.incomeLabel}
          </Text>
        </HStack>
        <Text
          font={16}
          fontWeight="semibold"
          foregroundStyle="label"
          lineLimit={1}
          minScaleFactor={0.65}
          multilineTextAlignment="center"
        >
          {aggregateMoney(props.incomeMinor)}
        </Text>
      </VStack>

      <VStack
        alignment="center"
        spacing={4}
        frame={{ maxWidth: "infinity", alignment: "center" }}
      >
        <HStack spacing={4} alignment="center">
          <Image
            systemName="clock.arrow.circlepath"
            font={11}
            foregroundStyle="#FF9500"
          />
          <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>
            {props.thirdMetricLabel}
          </Text>
        </HStack>
        <Text
          font={16}
          fontWeight="semibold"
          foregroundStyle="label"
          lineLimit={1}
          minScaleFactor={0.65}
          multilineTextAlignment="center"
        >
          {props.thirdMetricMinor === null ? "金额不可用" : `${aggregateMoney(props.thirdMetricMinor)}/天`}
        </Text>
      </VStack>
    </HStack>
  );
}

function OverviewItemStatusRow(props: {
  activeCount: number;
  endedCount: number;
  totalCount: number;
  period?: StatisticsPeriod;
  addedCount?: number;
  endedCountInPeriod?: number;
}) {
  const isPeriod = props.period && props.period !== "all";
  if (isPeriod) {
    return (
      <HStack
        spacing={14}
        alignment="center"
        padding={{ vertical: 7, horizontal: 12 }}
        frame={{ maxWidth: "infinity", alignment: "center" }}
        background={{
          style: "rgba(142, 142, 147, 0.08)",
          shape: {
            type: "rect",
            cornerRadius: 8,
            style: "continuous",
          },
        }}
      >
        <HStack spacing={5} alignment="center">
          <Image
            systemName="plus.circle.fill"
            font={8}
            foregroundStyle="#007AFF"
          />
          <Text font={12} foregroundStyle="secondaryLabel">
            年度新增
          </Text>
          <Text font={12} fontWeight="semibold" foregroundStyle="label">
            {`${props.addedCount ?? 0} 件`}
          </Text>
        </HStack>
        <Spacer />
        <HStack spacing={5} alignment="center">
          <Image
            systemName="stop.circle.fill"
            font={8}
            foregroundStyle="#8E8E93"
          />
          <Text font={12} foregroundStyle="secondaryLabel">
            结束持有
          </Text>
          <Text font={12} fontWeight="semibold" foregroundStyle="label">
            {`${props.endedCountInPeriod ?? 0} 件`}
          </Text>
        </HStack>
      </HStack>
    );
  }

  return (
    <HStack
      spacing={14}
      alignment="center"
      padding={{ vertical: 7, horizontal: 12 }}
      frame={{ maxWidth: "infinity", alignment: "center" }}
      background={{
        style: "rgba(142, 142, 147, 0.08)",
        shape: {
          type: "rect",
          cornerRadius: 8,
          style: "continuous",
        },
      }}
    >
      <HStack spacing={5} alignment="center">
        <Image systemName="circle.fill" font={6} foregroundStyle="#007AFF" />
        <Text font={12} foregroundStyle="secondaryLabel">
          在持
        </Text>
        <Text font={12} fontWeight="semibold" foregroundStyle="label">
          {`${props.activeCount} 件`}
        </Text>
      </HStack>
      <Spacer />
      <HStack spacing={5} alignment="center">
        <Image
          systemName="stop.circle.fill"
          font={6}
          foregroundStyle="#8E8E93"
        />
        <Text font={12} foregroundStyle="secondaryLabel">
          已结束
        </Text>
        <Text font={12} fontWeight="semibold" foregroundStyle="label">
          {`${props.endedCount} 件`}
        </Text>
      </HStack>
      <Spacer />
      <HStack spacing={5} alignment="center">
        <Text font={12} foregroundStyle="secondaryLabel">
          全部
        </Text>
        <Text font={12} fontWeight="semibold" foregroundStyle="label">
          {`${props.totalCount} 件`}
        </Text>
      </HStack>
    </HStack>
  );
}

function AttentionSummary(props: { alerts: StatisticsReport["alerts"] }) {
  const { alerts } = props;

  // 1. 保修健康槽：过期优先，其次即将到期，全无则保修正常
  const warrantySlot =
    alerts.warrantyExpired > 0
      ? {
          title: "保修已过期",
          count: alerts.warrantyExpired,
          icon: "calendar",
          color: "#FF3B30" as Color,
          chipFill: "rgba(255, 59, 48, 0.12)" as Color,
          isAlert: true,
        }
      : alerts.warrantyExpiringSoon > 0
        ? {
            title: "保修即将到期",
            count: alerts.warrantyExpiringSoon,
            icon: "calendar.badge.exclamationmark",
            color: "#FF9500" as Color,
            chipFill: "rgba(255, 149, 0, 0.12)" as Color,
            isAlert: true,
          }
        : {
            title: "保修期内",
            count: 0,
            icon: "calendar",
            color: "secondaryLabel" as Color,
            chipFill: "rgba(142, 142, 147, 0.08)" as Color,
            isAlert: false,
          };

  // 2. 状态健康槽：损坏优先，其次闲置，全无则全部在用
  const statusSlot =
    alerts.damagedCount > 0
      ? {
          title: "损坏待修",
          count: alerts.damagedCount,
          icon: "exclamationmark.triangle.fill",
          color: "#FF9500" as Color,
          chipFill: "rgba(255, 149, 0, 0.12)" as Color,
          isAlert: true,
        }
      : alerts.idleCount > 0
        ? {
            title: "闲置物品",
            count: alerts.idleCount,
            icon: "pause.circle.fill",
            color: "#8E8E93" as Color,
            chipFill: "rgba(142, 142, 147, 0.12)" as Color,
            isAlert: true,
          }
        : {
            title: "全部在用",
            count: 0,
            icon: "circle.fill",
            color: "secondaryLabel" as Color,
            chipFill: "rgba(142, 142, 147, 0.08)" as Color,
            isAlert: false,
          };

  // 3. 账目健康槽：购入缺失优先，其次回收缺失，全无则金额完整
  const financeSlot =
    alerts.unknownAcquisitionCount > 0
      ? {
          title: "购入金额缺失",
          count: alerts.unknownAcquisitionCount,
          icon: "questionmark.circle.fill",
          color: "#007AFF" as Color,
          chipFill: "rgba(0, 122, 255, 0.12)" as Color,
          isAlert: true,
        }
      : alerts.missingSoldRecoveryCount > 0
        ? {
            title: "出售回收缺失",
            count: alerts.missingSoldRecoveryCount,
            icon: "banknote.fill",
            color: "#34C759" as Color,
            chipFill: "rgba(52, 199, 89, 0.12)" as Color,
            isAlert: true,
          }
        : {
            title: "金额完整",
            count: 0,
            icon: "checkmark.circle.fill",
            color: "secondaryLabel" as Color,
            chipFill: "rgba(142, 142, 147, 0.08)" as Color,
            isAlert: false,
          };

  // 4. 分类健康槽：有未分类则提醒，无则已全部分类
  const categorySlot =
    alerts.uncategorizedCount > 0
      ? {
          title: "未分类物品",
          count: alerts.uncategorizedCount,
          icon: "questionmark.folder",
          color: "#007AFF" as Color,
          chipFill: "rgba(0, 122, 255, 0.12)" as Color,
          isAlert: true,
        }
      : {
          title: "已全部分类",
          count: 0,
          icon: "folder.fill",
          color: "secondaryLabel" as Color,
          chipFill: "rgba(142, 142, 147, 0.08)" as Color,
          isAlert: false,
        };

  return (
    <VStack
      spacing={6}
      padding={{ top: 0, bottom: 8 }}
      frame={{ maxWidth: "infinity" }}
    >
      <HStack spacing={6} frame={{ maxWidth: "infinity" }} alignment="center">
        <AttentionChip {...warrantySlot} />
        <AttentionChip {...statusSlot} />
      </HStack>
      <HStack spacing={6} frame={{ maxWidth: "infinity" }} alignment="center">
        <AttentionChip {...financeSlot} />
        <AttentionChip {...categorySlot} />
      </HStack>
    </VStack>
  );
}

function AttentionChip(props: {
  count: number;
  title: string;
  icon: string;
  color: Color;
  chipFill: Color;
  isAlert: boolean;
}) {
  return (
    <HStack
      spacing={4}
      padding={{ vertical: 4, horizontal: 8 }}
      frame={{ minHeight: 28, maxWidth: "infinity" }}
      background={{
        style: props.chipFill,
        shape: {
          type: "rect",
          cornerRadius: 8,
          style: "continuous",
        },
      }}
    >
      <Image
        systemName={props.icon}
        font={props.icon === "circle.fill" ? 8 : 12}
        foregroundStyle={props.color}
        frame={{ width: 14 }}
      />
      <Text
        font={12}
        foregroundStyle={props.isAlert ? "label" : "secondaryLabel"}
        lineLimit={1}
        minScaleFactor={0.75}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {props.title}
      </Text>
      <Text
        font={12}
        fontWeight={props.isAlert ? "semibold" : "regular"}
        foregroundStyle={props.isAlert ? props.color : "tertiaryLabel"}
        lineLimit={1}
        frame={{ alignment: "trailing" }}
      >
        {props.isAlert ? `${props.count}` : "0"}
      </Text>
    </HStack>
  );
}

function PeriodMenu(props: {
  period: StatisticsPeriod;
  availableYears: string[];
  onChanged: (period: StatisticsPeriod) => void;
}) {
  const currentLabel = props.period === "all" ? "全部" : `${props.period}年`;
  return (
    <Menu label={<Text>{currentLabel}</Text>}>
      <Button buttonStyle="plain" action={() => props.onChanged("all")}>
        <HStack spacing={8} frame={{ minWidth: 160, alignment: "leading" }}>
          <Image
            systemName={props.period === "all" ? "checkmark" : "circle"}
            font={13}
            frame={{ width: 18 }}
          />
          <Text>全部时间</Text>
        </HStack>
      </Button>

      {props.availableYears.map((year) => (
        <Button
          key={year}
          buttonStyle="plain"
          action={() => props.onChanged(year)}
        >
          <HStack spacing={8} frame={{ minWidth: 160, alignment: "leading" }}>
            <Image
              systemName={props.period === year ? "checkmark" : "circle"}
              font={13}
              frame={{ width: 18 }}
            />
            <Text>{`${year} 年`}</Text>
          </HStack>
        </Button>
      ))}
    </Menu>
  );
}

export function StatisticsPage() {
  const dismiss = Navigation.useDismiss();
  const [period, setPeriod] = useState<StatisticsPeriod>("all");
  const [expenseOrder, setExpenseOrder] = useState<"desc" | "asc">("desc");
  const [dailyCostOrder, setDailyCostOrder] = useState<"desc" | "asc">("desc");
  const [holdingTimeOrder, setHoldingTimeOrder] = useState<"desc" | "asc">(
    "desc",
  );
  const [report, setReport] = useState<StatisticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(
    () => subscribeDataChanges(() => setReloadToken((value) => value + 1)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getStatisticsReport(period)
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        setLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, reloadToken]);

  if (error && !report) {
    return (
      <NavigationStack>
        <List
          navigationTitle="统计"
          {...appListProps("glass", "inline")}
          toolbar={
            <Toolbar>
              <ToolbarItem placement="topBarLeading">
                <Button
                  title="返回"
                  systemImage="chevron.left"
                  labelStyle="iconOnly"
                  action={dismiss}
                />
              </ToolbarItem>
              <ToolbarItem placement="topBarTrailing">
                <Button
                  title="重试"
                  action={() => setReloadToken((value) => value + 1)}
                />
              </ToolbarItem>
            </Toolbar>
          }
        >
          <AppSection theme="glass" groupRows={false} >
            <NativeGroup>
              <VStack
                alignment="leading"
                spacing={8}
                padding={{ vertical: 12 }}
              >
                <Text font="headline" foregroundStyle="systemRed">
                  统计读取失败
                </Text>
                <Text foregroundStyle="secondaryLabel">{error}</Text>
                <Text font="caption" foregroundStyle="secondaryLabel">
                  读取失败不代表保存失败，请重试读取，不要重复执行刚才的操作。
                </Text>
              </VStack>
            </NativeGroup>
          </AppSection>
        </List>
      </NavigationStack>
    );
  }

  if (!report) {
    return (
      <NavigationStack>
        <List
          navigationTitle="统计"
          {...appListProps("glass", "inline")}
          toolbar={
            <Toolbar>
              <ToolbarItem placement="topBarLeading">
                <Button
                  title="返回"
                  systemImage="chevron.left"
                  labelStyle="iconOnly"
                  action={dismiss}
                />
              </ToolbarItem>
            </Toolbar>
          }
        >
          <AppSection theme="glass" groupRows={false} >
            <NativeGroup>
              <VStack
                alignment="center"
                spacing={10}
                padding={{ vertical: 30 }}
              >
                <Text foregroundStyle="secondaryLabel">载入统计中…</Text>
              </VStack>
            </NativeGroup>
          </AppSection>
        </List>
      </NavigationStack>
    );
  }

  const {
    snapshot,
    statuses,
    categories,
    expenseKinds,
    cashFlow,
    lifecycle,
    rankings,
    alerts,
  } = report;
  const hasItems =
    report.range.period === "all"
      ? snapshot.totalItemCount > 0
      : snapshot.addedCount > 0;
  const hasActiveItems = snapshot.activeCount > 0;
  const hasCashFlow = cashFlow.buckets.length > 0;
  const hasExpenses = expenseKinds.length > 0;
  const categoryChartData = buildCategoryChartData(categories);

  return (
    <NavigationStack>
      <List
        navigationTitle="统计"
        {...appListProps("glass", "inline")}
        overlay={
          snapshot.totalItemCount === 0
            ? {
                alignment: "center",
                content: (
                  <ContentUnavailableView
                    title="还没有统计数据"
                    systemImage="chart.bar.xaxis"
                    description="添加第一件物品后，这里会显示投入、回收、状态分布、陪伴时长和物品排行。"
                  />
                ),
              }
            : undefined
        }
        toolbar={
          <Toolbar>
            <ToolbarItem placement="topBarLeading">
              <Button
                title="返回"
                systemImage="chevron.left"
                labelStyle="iconOnly"
                action={dismiss}
              />
            </ToolbarItem>
            {snapshot.totalItemCount > 0 ? (
              <ToolbarItem placement="topBarTrailing">
                <PeriodMenu
                  period={period}
                  availableYears={report.availableYears}
                  onChanged={setPeriod}
                />
              </ToolbarItem>
            ) : null}
          </Toolbar>
        }
      >
        {error ? (
          <AppSection theme="glass" groupRows={false} >
            <NativeGroup>
              <Text foregroundStyle="systemOrange">{`刷新失败，当前仍显示${report.range.label}数据：${error}`}</Text>
              <Button
                title="重试刷新"
                action={() => setReloadToken((value) => value + 1)}
              />
            </NativeGroup>
          </AppSection>
        ) : null}
        {snapshot.totalItemCount === 0 ? null : (
          <>
            <AppSection theme="glass" groupRows={false} >
              <NativeGroup>
                <PlainCardHeader
                  title="物品概览"
                  detail={
                    report.range.period === "all"
                      ? "全部时间"
                      : `${report.range.period} 年`
                  }
                />

                {/* 1. 顶层主资产 (Hero) */}
                <VStack
                  spacing={4}
                  alignment="leading"
                  padding={{ top: 4, bottom: 16 }}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                >
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {report.range.period === "all"
                      ? "累计净投入"
                      : `${report.range.period} 年度净投入`}
                  </Text>
                  <Text
                    font={34}
                    fontWeight="bold"
                    foregroundStyle={
                      snapshot.netCostMinor !== null && snapshot.netCostMinor < 0 ? "#34C759" : "label"
                    }
                    lineLimit={1}
                    minScaleFactor={0.65}
                  >
                    {formatNetCost(snapshot.netCostMinor)}
                  </Text>
                </VStack>

                {/* 2. 三大财务切面并列 (投入 / 回收 / 每日花销或成本)，带微标并区域居中 */}
                <VStack
                  padding={{ bottom: 16 }}
                  frame={{ maxWidth: "infinity" }}
                >
                  <OverviewFinancialGrid
                    expenseMinor={snapshot.totalExpenseMinor}
                    incomeMinor={snapshot.totalIncomeMinor}
                    thirdMetricMinor={
                      report.range.period === "all"
                        ? snapshot.currentDailyCostMinor
                        : snapshot.periodDailyExpenseMinor
                    }
                    expenseLabel={
                      report.range.period === "all" ? "累计投入" : "年度投入"
                    }
                    incomeLabel={
                      report.range.period === "all" ? "累计回收" : "年度回收"
                    }
                    thirdMetricLabel={
                      report.range.period === "all" ? "每日成本" : "日均花销"
                    }
                  />
                </VStack>

                <Divider />

                {/* 3. 物品与状态管理区（位于分割线下方）：规模底槽 + 事项胶囊 */}
                <VStack
                  padding={{ top: 12, bottom: 6 }}
                  frame={{ maxWidth: "infinity" }}
                >
                  <OverviewItemStatusRow
                    activeCount={snapshot.activeCount}
                    endedCount={snapshot.endedCount}
                    totalCount={snapshot.totalItemCount}
                    period={report.range.period}
                    addedCount={snapshot.addedCount}
                    endedCountInPeriod={snapshot.endedCountInPeriod}
                  />
                </VStack>

                {report.overflowMetrics.length > 0 ? (
                  <NativeNoteRow text="部分汇总金额超出安全整数分范围，已标记为金额不可用；不可用金额不会作为 0 或截断值展示。件数、状态、合法日期的陪伴时长和可计算单物品排行仍可查看。" />
                ) : null}
                {snapshot.unavailableAmountCount > 0 ? (
                  <Text
                    font="caption"
                    foregroundStyle="systemOrange"
                    padding={{ bottom: 8 }}
                  >
                    {`${snapshot.unavailableAmountCount} 件期间相关物品的金额不完整或不可计算，金额统计已按可计算记录汇总。`}
                  </Text>
                ) : null}
                {snapshot.knownAmountCount < snapshot.amountRelevantCount ? (
                  <NativeNoteRow text="所选期间部分相关物品的金额未知或记录异常，金额仅按合法已知记录统计，并非完整数据总额。" />
                ) : null}

                {/* 4. 事项提醒胶囊区：仅在“全部时间”展示，年份复盘时自然收起 */}
                {report.range.period === "all" ? (
                  <AttentionSummary alerts={alerts} />
                ) : null}
              </NativeGroup>
            </AppSection>

            <AppSection theme="glass" groupRows={false} >
              <NativeGroup>
                {/* StatusAnalysisCard owns the empty state: a year with cash
                    flow but no newly purchased items must still say "该年度没有
                    购入物品记录" instead of the all-time hint. */}
                <StatusAnalysisCard
                  statuses={statuses}
                  period={report.range.period}
                />
                {hasItems && categoryChartData.items.length > 0 ? (
                  <Divider />
                ) : null}
                <CategoryAnalysisCard
                  data={categoryChartData}
                  period={report.range.period}
                />
                {hasExpenses ? (
                  <>
                    <Divider />
                    <ExpenseAnalysisBlock
                      entries={expenseKinds}
                      period={report.range.period}
                    />
                  </>
                ) : null}
              </NativeGroup>
            </AppSection>

            <AppSection theme="glass" groupRows={false} >
              <NativeGroup>
                <PlainCardHeader
                  title="支出统计"
                  detail={
                    report.range.period === "all"
                      ? "全部时间"
                      : `${report.range.period} 年`
                  }
                />
                <HStack
                  spacing={14}
                  padding={{ top: 10, bottom: 12 }}
                  frame={{ maxWidth: "infinity" }}
                >
                  <StatMetric
                    label={
                      report.range.period === "all" ? "累计支出" : "年度支出"
                    }
                    value={aggregateMoney(cashFlow.expenseMinor)}
                    color="#007AFF"
                    centered
                  />
                  <StatMetric
                    label={
                      report.range.period === "all" ? "累计收入" : "年度收入"
                    }
                    value={aggregateMoney(cashFlow.incomeMinor)}
                    color="#34C759"
                    centered
                  />
                </HStack>
                {hasCashFlow ? (
                  <VStack
                    padding={{ top: 8, bottom: 6 }}
                    frame={{ maxWidth: "infinity" }}
                  >
                    <CashFlowChart buckets={cashFlow.buckets} />
                  </VStack>
                ) : (
                  <NativeNoteRow text="所选期间没有可统计的金额记录。" />
                )}
                <Divider />
                <HStack
                  spacing={18}
                  padding={{ top: 8, bottom: 8 }}
                  frame={{ maxWidth: "infinity", alignment: "center" }}
                >
                  <HStack spacing={5}>
                    <Image
                      systemName="circle.fill"
                      font={8}
                      foregroundStyle="#007AFF"
                    />
                    <Text font="caption2" foregroundStyle="secondaryLabel">
                      支出
                    </Text>
                  </HStack>
                  <HStack spacing={5}>
                    <Image
                      systemName="circle.fill"
                      font={8}
                      foregroundStyle="#34C759"
                    />
                    <Text font="caption2" foregroundStyle="secondaryLabel">
                      收入
                    </Text>
                  </HStack>
                </HStack>
              </NativeGroup>
            </AppSection>

            {/* 陪伴时长：仅在“全部时间”展示（纯当前资产健康指标） */}
            {report.range.period === "all" ? (
              <AppSection theme="glass" groupRows={false} >
                <NativeGroup>
                  <PlainCardHeader title="陪伴时长" />
                  <HStack
                    spacing={14}
                    padding={{ top: 10, bottom: 12 }}
                    frame={{ maxWidth: "infinity" }}
                  >
                    <StatMetric
                      label="当前平均陪伴"
                      value={
                        hasActiveItems
                          ? formatDays(lifecycle.averageCurrentHoldingDays)
                          : "—"
                      }
                      centered
                    />
                    <StatMetric
                      label="当前最长陪伴"
                      value={
                        hasActiveItems
                          ? formatDays(lifecycle.longestCurrentHoldingDays)
                          : "—"
                      }
                      centered
                    />
                  </HStack>
                  {lifecycle.unavailableHoldingCount > 0 ? (
                    <NativeNoteRow text={`${lifecycle.unavailableHoldingCount} 件在持物品的日期异常，天数不可用；平均、最长及分布仅包含 ${lifecycle.knownHoldingCount} 件日期合法物品。`} />
                  ) : null}
                  <Divider />
                  {hasActiveItems ? (
                    <HoldingDurationRows buckets={lifecycle.holdingBuckets} />
                  ) : (
                    <NativeNoteRow text="添加仍在持有的物品后，这里会显示陪伴时长。" />
                  )}
                </NativeGroup>
              </AppSection>
            ) : null}

            {(expenseOrder === "desc"
              ? rankings.topExpense
              : rankings.bottomExpense
            ).length > 0 ? (
              <AppSection theme="glass" groupRows={false} >
                <NativeGroup>
                  <RankingCardHeader
                    title={
                      report.range.period === "all"
                        ? "累计投入"
                        : `${report.range.period} 年度投入`
                    }
                    order={expenseOrder}
                    onToggle={setExpenseOrder}
                  />
                  {(expenseOrder === "desc"
                    ? rankings.topExpense
                    : rankings.bottomExpense
                  )
                    .slice(0, 5)
                    .map((item, index) => (
                      <RankingRow
                        key={`expense-${item.itemId}`}
                        item={item}
                        rank={index + 1}
                        mode="expense"
                      />
                    ))}
                </NativeGroup>
              </AppSection>
            ) : null}

            {(dailyCostOrder === "desc"
              ? rankings.topDailyCost
              : rankings.bottomDailyCost
            ).length > 0 ? (
              <AppSection theme="glass" groupRows={false} >
                <NativeGroup>
                  <RankingCardHeader
                    title={
                      report.range.period === "all"
                        ? "每日成本"
                        : `${report.range.period} 年度每日成本`
                    }
                    order={dailyCostOrder}
                    onToggle={setDailyCostOrder}
                  />
                  {(dailyCostOrder === "desc"
                    ? rankings.topDailyCost
                    : rankings.bottomDailyCost
                  )
                    .slice(0, 5)
                    .map((item, index) => (
                      <RankingRow
                        key={`daily-${item.itemId}`}
                        item={item}
                        rank={index + 1}
                        mode="daily"
                      />
                    ))}
                </NativeGroup>
              </AppSection>
            ) : null}

            {(holdingTimeOrder === "desc"
              ? rankings.topHoldingTime
              : rankings.bottomHoldingTime
            ).length > 0 ? (
              <AppSection theme="glass" groupRows={false} >
                <NativeGroup>
                  <RankingCardHeader
                    title={
                      report.range.period === "all"
                        ? "陪伴时间"
                        : `${report.range.period} 年度陪伴时间`
                    }
                    order={holdingTimeOrder}
                    onToggle={setHoldingTimeOrder}
                  />
                  {(holdingTimeOrder === "desc"
                    ? rankings.topHoldingTime
                    : rankings.bottomHoldingTime
                  )
                    .slice(0, 5)
                    .map((item, index) => (
                      <RankingRow
                        key={`holding-${item.itemId}`}
                        item={item}
                        rank={index + 1}
                        mode="holding"
                      />
                    ))}
                </NativeGroup>
              </AppSection>
            ) : null}

            {rankings.topExpense.length === 0 &&
            rankings.topDailyCost.length === 0 &&
            rankings.topHoldingTime.length === 0 ? (
              <AppSection theme="glass" groupRows={false} >
                <NativeGroup>
                  <RankingCardHeader
                    title="物品排行"
                    order={expenseOrder}
                    onToggle={setExpenseOrder}
                  />
                  <NativeNoteRow text="金额完整的物品增加后，这里会显示重点物品。" />
                </NativeGroup>
              </AppSection>
            ) : null}

            {loading ? (
              <AppSection theme="glass" groupRows={false}
                listRowBackground={<Rectangle fill="clear" />}
                listRowSeparator="hidden"
                listRowInsets={0}
              >
                <Text
                  font="caption"
                  foregroundStyle="secondaryLabel"
                  padding={{ vertical: 8 }}
                >
                  正在刷新统计…
                </Text>
              </AppSection>
            ) : null}
          </>
        )}
      </List>
    </NavigationStack>
  );
}
