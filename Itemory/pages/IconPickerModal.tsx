import {
  Button,
  Image,
  LazyVGrid,
  List,
  Navigation,
  NavigationStack,
  Section,
  Text,
  VStack,
  useEffect,
  useMemo,
  useRef,
  useState,
  type GridItem,
} from "scripting";
import {
  PRESET_ITEM_EMOJIS,
  PRESET_CATEGORY_SYMBOLS,
  type PresetIconItem,
} from "../models/preset-icons";


import { isEmojiSymbol } from "../ui/UniversalIcon";
import { nativeListPageProps } from "../ui/native-list";

const ADAPTIVE_GRID_COLUMNS: GridItem[] = [
  { size: { type: "adaptive", min: 54, max: 68 } },
];

function EmojiCell(props: {
  item: PresetIconItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { item, selected, onSelect } = props;
  const isEmoji = isEmojiSymbol(item.symbol);

  return (
    <Button buttonStyle="plain" action={onSelect}>
      <VStack
        alignment="center"
        frame={{ width: 54, height: 54 }}
        background={selected ? "secondarySystemFill" : "clear"}
        clipShape={{
          type: "rect",
          cornerRadius: 14,
          style: "continuous",
        }}
      >
        {isEmoji ? (
          <Text
            font={30}
            multilineTextAlignment="center"
            frame={{ width: 54, height: 54, alignment: "center" }}
          >
            {item.symbol}
          </Text>
        ) : (
          <Image
            systemName={item.symbol}
            font={24}
            foregroundStyle={selected ? "accentColor" : "secondaryLabel"}
            frame={{ width: 54, height: 54 }}
          />
        )}
      </VStack>
    </Button>
  );
}

export function IconPickerModal(props: {
  kind?: "item" | "category";
  selectedSymbol?: string | null;
  onSelect: (item: PresetIconItem) => Promise<void> | void;
  onClear?: () => Promise<void> | void;
}) {
  const { kind = "item", selectedSymbol, onSelect, onClear } = props;
  const dismiss = Navigation.useDismiss();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectionLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function select(work: () => Promise<void> | void) {
    if (!alive.current || selectionLock.current) return;
    selectionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await Promise.resolve(work());
      if (alive.current) dismiss();
    } catch (err) {
      if (!alive.current) return;
      selectionLock.current = false;
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const baseList = kind === "category" ? PRESET_CATEGORY_SYMBOLS : PRESET_ITEM_EMOJIS;

  const filteredEmojis = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.symbol.includes(q) ||
        item.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
  }, [baseList, query]);

  return (
    <NavigationStack>
      <List
        navigationTitle={kind === "category" ? "选择分类图标" : "选择物品图标"}
        {...nativeListPageProps("inline")}
        searchable={{
          value: query,
          onChanged: setQuery,
          prompt: "搜索图标",
        }}
        toolbar={{
          cancellationAction: (
            <Button
              title="取消"
              disabled={busy}
              action={() => dismiss()}
            />
          ),
          confirmationAction: onClear && selectedSymbol ? (
            <Button
              title="清除图标"
              disabled={busy}
              action={() => {
                if (onClear) void select(onClear);
              }}
            />
          ) : undefined,
        }}
      >
        {error ? (
          <Section>
            <Text foregroundStyle="systemRed">{error}</Text>
          </Section>
        ) : null}

        <Section
          listRowInsets={{ top: 14, bottom: 14, leading: 14, trailing: 14 }}
        >
          {filteredEmojis.length === 0 ? (
            <VStack
              alignment="center"
              padding={{ vertical: 40 }}
              frame={{ maxWidth: "infinity", alignment: "center" }}
            >
              <Text font="headline" foregroundStyle="secondaryLabel">
                未找到相关物品图标
              </Text>
              <Text font="caption" foregroundStyle="secondaryLabel" padding={{ top: 4 }}>
                尝试搜索常见生活物品词汇
              </Text>
            </VStack>
          ) : (
            <LazyVGrid columns={ADAPTIVE_GRID_COLUMNS} spacing={10}>
              {filteredEmojis.map((item) => (
                <EmojiCell
                  key={`${item.id}-${item.symbol}`}
                  item={item}
                  selected={selectedSymbol === item.symbol}
                  onSelect={() => void select(() => onSelect(item))}
                />
              ))}
            </LazyVGrid>
          )}
        </Section>
      </List>
    </NavigationStack>
  );
}
