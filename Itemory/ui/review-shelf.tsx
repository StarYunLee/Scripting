import {
  Button,
  HStack,
  Image,
  Rectangle,
  VStack,
  ZStack,
  useEffect,
  useState,
} from "scripting";
import type { ReviewItem } from "../services/review";
import type { ShelfRow } from "../services/review-shelf";
import { invalidateCoverValidation, resolveCoverPath } from "../services/covers";
import { UniversalIcon } from "./UniversalIcon";

const DISPLAY_EDGE = 92;
const DISPLAY_HEIGHT = 104;
const SHELF_GAP = 18;

/** Fixed presentation frame by design: no type inference, alpha analysis,
 * visible-bounds cache, or item-name text. Images keep their original ratio.
 */
type ShelfCoverState = {
  assetId: string;
  revision: number;
  path: string;
};

/** 置物架封面：`covers/<id>.png` 只是可重建的派生副本，缺失时用库内字节重建。
 * 结果按 assetId + revision 记名，过期结果直接丢弃，绝不让旧图覆盖新图。 */
function ShelfCover(props: { item: ReviewItem; edge: number }) {
  const { item, edge } = props;
  const [cover, setCover] = useState<ShelfCoverState | null>(null);
  useEffect(() => {
    let active = false;
    const assetId = item.coverAssetId;
    setCover(null);
    if (!assetId) return;
    active = true;
    const revision = item.revision;
    const usable = (path: string | null): path is string => {
      if (!path) return false;
      try {
        return FileManager.existsSync(path);
      } catch {
        return false;
      }
    };
    void (async () => {
      try {
        let result = await resolveCoverPath(assetId);
        if (!active) return;
        if (!usable(result.path)) {
          // 解析缓存可能仍记着已校验的缓存路径，而临时缓存已被系统清理：清缓存后
          // 从 asset_blobs 重建一次（resolveCoverPath 内部会重建 cache/covers）。
          invalidateCoverValidation(assetId);
          result = await resolveCoverPath(assetId);
          if (!active) return;
        }
        if (!usable(result.path)) return;
        setCover({ assetId, revision, path: result.path });
      } catch {
        /* 封面缺失/损坏只影响这一格；物品仍然出现在置物架上。 */
      }
    })();
    return () => {
      active = false;
    };
  }, [item.coverAssetId, item.revision]);
  const path =
    cover &&
    cover.assetId === item.coverAssetId &&
    cover.revision === item.revision
      ? cover.path
      : null;
  if (path) {
    return (
      <Image
        filePath={path}
        resizable
        scaleToFit
        renderingMode="original"
        frame={{ width: edge, height: edge }}
      />
    );
  }
  return (
    <UniversalIcon
      symbol={item.iconSymbol}
      size={Math.min(58, edge * 0.7)}
      color="accentColor"
    />
  );
}

function ShelfItem(props: {
  item: ReviewItem;
  columnWidth: number;
  open: (id: string) => void;
}) {
  const { item, columnWidth, open } = props;
  const edge = Math.min(DISPLAY_EDGE, Math.max(52, columnWidth - 12));
  return (
    <Button buttonStyle="plain" action={() => open(item.id)}>
      <VStack
        spacing={0}
        frame={{ width: columnWidth, height: DISPLAY_HEIGHT, alignment: "bottom" }}
        contentShape="rect"
      >
        <ShelfCover item={item} edge={edge} />
      </VStack>
    </Button>
  );
}

function ShelfBoard({ width }: { width: number }) {
  const boardWidth = Math.max(0, width - 24);
  return (
    <VStack frame={{ width, height: 11 }} alignment="center" allowsHitTesting={false}>
      <ZStack frame={{ width: boardWidth, height: 11 }}>
        <Rectangle
          fill={{ light: "#D0CFD5", dark: "#45464D" }}
          frame={{ width: boardWidth, height: 7 }}
          clipShape={{ type: "rect", cornerRadius: 3.5 }}
          shadow={{ color: "rgba(0,0,0,0.16)", radius: 5, x: 0, y: 5 }}
        />
        <Rectangle
          fill={{
            light: "rgba(255,255,255,0.90)",
            dark: "rgba(255,255,255,0.16)",
          }}
          frame={{ width: boardWidth, height: 1 }}
          clipShape={{ type: "rect", cornerRadius: 0.5 }}
          offset={{ x: 0, y: -3 }}
        />
        <Rectangle
          fill={{
            light: "rgba(130,130,140,0.28)",
            dark: "rgba(0,0,0,0.30)",
          }}
          frame={{ width: boardWidth, height: 2 }}
          clipShape={{ type: "rect", cornerRadius: 1 }}
          offset={{ x: 0, y: 3 }}
        />
      </ZStack>
    </VStack>
  );
}

export function ReviewShelfRow(props: {
  row: ShelfRow<ReviewItem>;
  width: number;
  columns: number;
  open: (id: string) => void;
}) {
  const { row, width, columns, open } = props;
  const safeColumns = Math.max(1, Math.trunc(columns));
  const columnWidth = width / safeColumns;
  return (
    <VStack
      spacing={0}
      listRowInsets={0}
      listRowSeparator="hidden"
      listRowBackground={<Rectangle fill="clear" />}
    >
      <HStack
        spacing={0}
        alignment="bottom"
        frame={{ width, height: DISPLAY_HEIGHT, alignment: "leading" }}
      >
        {row.items.map((item) => (
          <ShelfItem
            key={item.id}
            item={item}
            columnWidth={columnWidth}
            open={open}
          />
        ))}
        {Array.from({ length: safeColumns - row.items.length }, (_, index) => (
          <Rectangle
            key={`empty-${index}`}
            fill="clear"
            frame={{ width: columnWidth, height: DISPLAY_HEIGHT }}
            allowsHitTesting={false}
          />
        ))}
      </HStack>
      <ShelfBoard width={width} />
      <Rectangle
        fill="clear"
        frame={{ width, height: SHELF_GAP }}
        allowsHitTesting={false}
      />
    </VStack>
  );
}
