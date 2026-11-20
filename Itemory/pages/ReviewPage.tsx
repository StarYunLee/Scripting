import {
  Button,
  Circle,
  ContentUnavailableView,
  GeometryReader,
  HStack,
  Image,
  List,
  Menu,
  Navigation,
  NavigationStack,
  Rectangle,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
  ZStack,
  useEffect,
  useState,
} from "scripting";
import { DelayedSpinner } from "../ui/delayed-spinner";
import {
  buildReviewRows,
  getReviewPage,
  reviewItemSubtitle,
  type ReviewItem,
  type ReviewTimelineRow,
} from "../services/review";
import { ReviewController } from "../services/review-controller";
import { buildShelfRows } from "../services/review-shelf";
import { ReviewShelfRow } from "../ui/review-shelf";
import { resolveCoverPath } from "../services/covers";
import { subscribeDataChanges } from "../services/change-store";
import { UniversalIcon } from "../ui/UniversalIcon";
import { ItemPage } from "./ItemPage";
import { NativeMenuChoice } from "../ui/native-list";
import {
  appListProps,
  appReviewCardProps,
  appReviewPageTopInset,
  appReviewTopInset,
  AppSection,
} from "../ui/theme-props";
import { EmptyState } from "../ui/common";
import { UI_METRICS } from "../ui/metrics";

const COVER_SIZE = 54;
const LEFT_COL_WIDTH = UI_METRICS.reviewDateColumnWidth;
const TRACK_WIDTH = 22;

function parseAcquiredDate(ymd: string): {
  day: string;
  month: string;
  year: string;
} {
  const parts = ymd.split("-");
  if (parts.length === 3) {
    return {
      year: parts[0],
      month: `${parts[1]}月`,
      day: parts[2],
    };
  }
  return { year: "", month: "", day: ymd };
}

/** Resolve row covers independently of the query, using the existing bounded validation cache. */
function ReviewCover({ item }: { item: ReviewItem }) {
  const [cover, setCover] = useState<{
    assetId: string;
    revision: number;
    path: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const assetId = item.coverAssetId;
    setCover(null);
    if (assetId) {
      void resolveCoverPath(assetId)
        .then((result) => {
          if (active && result.path)
            setCover({
              assetId,
              revision: item.revision,
              path: result.path,
            });
        })
        .catch(() => {
          /* A missing/corrupt cover must not remove the item from history. */
        });
    }
    return () => {
      active = false;
    };
  }, [item.coverAssetId, item.revision]);
  const path =
    cover?.assetId === item.coverAssetId && cover?.revision === item.revision
      ? cover.path
      : null;
  return (
    <VStack
      spacing={0}
      frame={{ width: COVER_SIZE, height: COVER_SIZE }}
      clipShape={{ type: "rect", cornerRadius: 10, style: "continuous" }}
      alignment="center"
    >
      {path ? (
        <Image
          filePath={path}
          resizable
          scaleToFit
          renderingMode="original"
          frame={{ width: COVER_SIZE, height: COVER_SIZE }}
          clipShape={{ type: "rect", cornerRadius: 10, style: "continuous" }}
        />
      ) : (
        <UniversalIcon symbol={item.iconSymbol} size={32} color="accentColor" />
      )}
    </VStack>
  );
}

function ReviewRow(props: {
  row: ReviewTimelineRow;
  open: (id: string) => void;
  topInset?: number;
}) {
  const { item, startsDay, endsDay } = props.row;
  const subtitle = reviewItemSubtitle(item);
  const date = parseAcquiredDate(item.acquiredOn);

  return (
    <HStack
      spacing={0}
      alignment="top"
      frame={{ maxWidth: "infinity" }}
      padding={{
        bottom: endsDay
          ? UI_METRICS.reviewRowBottomSpacing
          : UI_METRICS.reviewRowSameDaySpacing,
      }}
      listRowInsets={{
        top: props.topInset ?? 0,
        bottom: 0,
        leading: 0,
        trailing: 0,
      }}
      listRowSeparator="hidden"
      listRowBackground={<Rectangle fill="clear" />}
    >
      <VStack
        spacing={1}
        alignment="center"
        frame={{ width: LEFT_COL_WIDTH, alignment: "center" }}
        padding={{ top: 2 }}
      >
        {startsDay ? (
          <>
            <Text font={18} fontWeight="bold" lineLimit={1}>
              {date.day}
            </Text>
            <Text
              font={11}
              foregroundStyle="secondaryLabel"
              lineLimit={1}
            >
              {date.month}
            </Text>
            <Text
              font={10}
              foregroundStyle="tertiaryLabel"
              lineLimit={1}
            >
              {date.year}
            </Text>
          </>
        ) : null}
      </VStack>

      <ZStack
        frame={{ width: TRACK_WIDTH, alignment: "top" }}
        allowsHitTesting={false}
      >
        <Rectangle
          fill="separator"
          frame={{ width: 1, alignment: "center" }}
        />
        {startsDay ? (
          <VStack
            frame={{ width: TRACK_WIDTH, height: 14 }}
            padding={{ top: 5 }}
          >
            <Circle fill="accentColor" frame={{ width: 6, height: 6 }} />
          </VStack>
        ) : null}
      </ZStack>

      <HStack
          spacing={12}
          alignment="center"
          padding={{
            horizontal: UI_METRICS.reviewCardPaddingHorizontal,
            vertical: UI_METRICS.reviewCardPaddingVertical,
          }}
          frame={{
            minWidth: 0,
            maxWidth: "infinity",
            alignment: "leading",
          }}
          {...appReviewCardProps("glass")}
          contentShape="rect"
          onTapGesture={() => props.open(item.id)}
        >
          <ReviewCover item={item} />
          <VStack
            spacing={3}
            alignment="leading"
            frame={{
              minWidth: 0,
              maxWidth: "infinity",
              alignment: "leading",
            }}
          >
            <Text font="body" fontWeight="semibold" lineLimit={1}>
              {item.name}
            </Text>
            {subtitle ? (
              <Text
                font="footnote"
                foregroundStyle="secondaryLabel"
                lineLimit={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </VStack>
      </HStack>
    </HStack>
  );
}

export function ReviewPage() {
  const dismiss = Navigation.useDismiss();
  const [controller] = useState(() => new ReviewController(getReviewPage));
  const [review, setReview] = useState(controller.state);
  const [openedItemId, setOpenedItemId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"timeline" | "shelf">("timeline");
  const { desired, snapshot, operation, error, showProgress } = review;
  const rows = buildReviewRows(snapshot?.items ?? []);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setReview);
    const unsubscribeData = subscribeDataChanges(() =>
      controller.dataChanged(),
    );
    controller.start();
    return () => {
      unsubscribeData();
      unsubscribe();
      controller.dispose();
    };
  }, []);

  function openItem(id: string) {
    if (controller.canOpen()) setOpenedItemId(id);
  }

  const filtersActive =
    desired.year !== "all" || desired.direction !== "desc";

  return (
    <NavigationStack>
      <GeometryReader>
        {(proxy) => {
          const shelfWidth = Math.max(0, proxy.size.width - 32);
          const shelfColumns = Math.max(
            3,
            Math.min(8, Math.floor(shelfWidth / 120)),
          );
          const shelfRows =
            layout === "shelf"
              ? buildShelfRows(snapshot?.items ?? [], shelfColumns)
              : [];
          return (
            <List
              navigationTitle={layout === "timeline" ? "时间线" : "置物架"}
              {...appListProps("glass", "inline")}
              contentMargins={{
                edges: "all",
                insets: {
                  top: appReviewPageTopInset("glass"),
                  bottom: 16,
                  leading: 16,
                  trailing: 16,
                },
                placement: "scrollContent",
              }}
              overlay={
                !snapshot && !error
                  ? { alignment: "center", content: <DelayedSpinner /> }
                  : snapshot && (snapshot.years?.length ?? 0) === 0
                  ? {
                      alignment: "center",
                      content: (
                        <ContentUnavailableView
                          title="还没有可回顾的物品"
                          systemImage="clock.arrow.circlepath"
                          description="先在「物品」中添加记录，之后可用时间线和置物架回看它们。"
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
                  <ToolbarItem placement="topBarTrailing">
                    <Menu
                      title="筛选与排序"
                      systemImage="line.3.horizontal.decrease.circle"
                      labelStyle="iconOnly"
                      foregroundStyle={filtersActive ? "accentColor" : "label"}
                    >
                      <Menu
                        title={`年份 · ${desired.year === "all" ? "全部" : `${desired.year} 年`}`}
                        systemImage="calendar"
                      >
                        <Button
                          buttonStyle="plain"
                          action={() => controller.select({ year: "all" })}
                        >
                          <NativeMenuChoice
                            title="全部年份"
                            selected={desired.year === "all"}
                          />
                        </Button>
                        {(snapshot?.years ?? []).map((year) => (
                          <Button
                            key={year}
                            buttonStyle="plain"
                            action={() => controller.select({ year })}
                          >
                            <NativeMenuChoice
                              title={`${year} 年`}
                              selected={desired.year === year}
                            />
                          </Button>
                        ))}
                      </Menu>
                      <Menu
                        title={`顺序 · ${desired.direction === "desc" ? "从近到远" : "从远到近"}`}
                        systemImage="arrow.up.arrow.down"
                      >
                        <Button
                          buttonStyle="plain"
                          action={() =>
                            controller.select({ direction: "desc" })
                          }
                        >
                          <NativeMenuChoice
                            title="从近到远"
                            selected={desired.direction === "desc"}
                          />
                        </Button>
                        <Button
                          buttonStyle="plain"
                          action={() =>
                            controller.select({ direction: "asc" })
                          }
                        >
                          <NativeMenuChoice
                            title="从远到近"
                            selected={desired.direction === "asc"}
                          />
                        </Button>
                      </Menu>
                    </Menu>
                  </ToolbarItem>
                  <ToolbarItem placement="topBarTrailing">
                    <Button
                      title={
                        layout === "timeline" ? "切换到置物架" : "切换到时间线"
                      }
                      systemImage={
                        layout === "timeline"
                          ? "books.vertical"
                          : "calendar.day.timeline.leading"
                      }
                      labelStyle="iconOnly"
                      action={() =>
                        setLayout((previous) =>
                          previous === "timeline" ? "shelf" : "timeline",
                        )
                      }
                    />
                  </ToolbarItem>
                </Toolbar>
              }
              refreshable={() => controller.refresh()}
              navigationDestination={{
                isPresented: openedItemId !== null,
                onChanged: (value) => {
                  if (!value) setOpenedItemId(null);
                },
                content: openedItemId ? (
                  <ItemPage itemId={openedItemId} />
                ) : (
                  <Text>物品</Text>
                ),
              }}
            >
              {!snapshot && error ? (
                <AppSection theme="glass" groupRows={false} >
                  <Text foregroundStyle="secondaryLabel">
                    暂时无法读取物品回顾
                  </Text>
                  {error ? (
                    <VStack spacing={8} alignment="leading">
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={3}
                      >
                        {error.message}
                      </Text>
                      <Button
                        title="重新读取"
                        action={() => controller.retry()}
                      />
                    </VStack>
                  ) : null}
                </AppSection>
              ) : null}

              {snapshot &&
              (snapshot.years?.length ?? 0) > 0 &&
              rows.length === 0 ? (
                <AppSection theme="glass" groupRows={false}>
                  <EmptyState
                    title={
                      desired.year === "all"
                        ? "没有匹配的物品"
                        : `${desired.year} 年没有回顾记录`
                    }
                    detail="切换年份，或查看全部年份。"
                  />
                  {desired.year !== "all" ? (
                    <Button
                      title="查看全部年份"
                      action={() => controller.select({ year: "all" })}
                    />
                  ) : null}
                </AppSection>
              ) : null}

              {rows.length > 0 && layout === "timeline" ? (
                <AppSection theme="glass" groupRows={false}
                  surface="none"
                  listRowBackground={<Rectangle fill="clear" />}
                  listRowSeparator="hidden"
                  listRowInsets={0}
                >
                  {rows.map((row, index) => (
                    <ReviewRow
                      key={row.item.id}
                      row={row}
                      open={openItem}
                      topInset={
                        index === 0 ? appReviewTopInset("glass") : 0
                      }
                    />
                  ))}
                </AppSection>
              ) : (
                <AppSection theme="glass" groupRows={false}
                  surface="none"
                  listRowBackground={<Rectangle fill="clear" />}
                  listRowSeparator="hidden"
                  listRowInsets={0}
                >
                  {shelfRows.map((row) => (
                    <ReviewShelfRow
                      key={row.key}
                      row={row}
                      width={shelfWidth}
                      columns={shelfColumns}
                      open={openItem}
                    />
                  ))}
                </AppSection>
              )}

              {snapshot && (error || showProgress || snapshot.hasMore) ? (
                <AppSection theme="glass" groupRows={false} >
                  <VStack
                    spacing={8}
                    frame={{ maxWidth: "infinity", alignment: "leading" }}
                  >
                    {error ? (
                      <>
                        <Text font="footnote" foregroundStyle="secondaryLabel">
                          {error.kind === "append"
                            ? "未能读取更早的物品"
                            : error.kind === "replace"
                              ? "切换失败，已保留上次结果"
                              : "更新失败，当前显示上次结果"}
                        </Text>
                        <Text
                          font="caption2"
                          foregroundStyle="secondaryLabel"
                          lineLimit={2}
                        >
                          {error.message}
                        </Text>
                        <Button
                          title="重试"
                          action={() => controller.retry()}
                          disabled={operation !== null}
                        />
                      </>
                    ) : operation ? (
                      <Text font="footnote" foregroundStyle="secondaryLabel">
                        {operation === "append"
                          ? "正在读取更多物品…"
                          : "正在更新回顾…"}
                      </Text>
                    ) : (
                      <Button
                        title="继续回顾"
                        action={() => controller.append()}
                        disabled={review.stale}
                      />
                    )}
                  </VStack>
                </AppSection>
              ) : null}
            </List>
          );
        }}
      </GeometryReader>
    </NavigationStack>
  );
}
