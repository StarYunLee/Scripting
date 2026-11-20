import { PREFS_PATH } from "./paths";
import { assertSessionWritable } from "./mutation-coordinator";

export type InventoryLayout = "list" | "card";
export type UiTheme = "native" | "glass";

type Prefs = {
  inventoryLayout: InventoryLayout;
  hiddenCategoryIds: string[];
  uiTheme: UiTheme;
};

type PrefsUpdate<Result> = {
  next: Prefs;
  result: Result;
};

const listeners = new Set<(layout: InventoryLayout) => void>();
const themeListeners = new Set<(theme: UiTheme) => void>();
let cached: Prefs | null = null;

function isLayout(value: unknown): value is InventoryLayout {
  return value === "list" || value === "card";
}

function isUiTheme(value: unknown): value is UiTheme {
  return value === "native" || value === "glass";
}

function clonePrefs(prefs: Prefs): Prefs {
  return {
    inventoryLayout: prefs.inventoryLayout,
    hiddenCategoryIds: [...prefs.hiddenCategoryIds],
    uiTheme: prefs.uiTheme,
  };
}

function readPrefs(): Prefs {
  if (cached) return cached;
  try {
    if (FileManager.existsSync(PREFS_PATH)) {
      const parsed = JSON.parse(
        FileManager.readAsStringSync(PREFS_PATH),
      ) as Partial<Prefs>;
      cached = {
        inventoryLayout: isLayout(parsed.inventoryLayout)
          ? parsed.inventoryLayout
          : "list",
        hiddenCategoryIds: Array.isArray(parsed.hiddenCategoryIds)
          ? Array.from(
              new Set(
                parsed.hiddenCategoryIds.filter(
                  (id): id is string => typeof id === "string",
                ),
              ),
            )
          : [],
        uiTheme: isUiTheme(parsed.uiTheme) ? parsed.uiTheme : "native",
      };
      return cached;
    }
  } catch {
    // keep default
  }
  cached = {
    inventoryLayout: "list",
    hiddenCategoryIds: [],
    uiTheme: "native",
  };
  return cached;
}

let writeQueue: Promise<void> = Promise.resolve();
let lastWriteSucceeded = true;

async function commitPrefs<Result>(
  derive: (current: Prefs) => PrefsUpdate<Result>,
): Promise<{ success: boolean; result: Result }> {
  let outcome!: { success: boolean; result: Result };
  const write = async () => {
    const { next, result } = derive(clonePrefs(readPrefs()));
    try {
      await FileManager.writeAsString(PREFS_PATH, JSON.stringify(next));
      cached = clonePrefs(next);
      lastWriteSucceeded = true;
      outcome = { success: true, result };
    } catch {
      // The committed cache remains aligned with the last successful disk state.
      lastWriteSucceeded = false;
      outcome = { success: false, result };
    }
  };
  const task = writeQueue.then(write, write);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  await task;
  return outcome;
}

export async function flushPrefs(): Promise<void> {
  await writeQueue;
  if (!lastWriteSucceeded)
    throw new Error("设置尚未成功保存，不能制作完整备份");
}

export function getInventoryLayout(): InventoryLayout {
  return readPrefs().inventoryLayout;
}

export function getUiTheme(): UiTheme {
  return readPrefs().uiTheme;
}

export function subscribeUiTheme(fn: (theme: UiTheme) => void): () => void {
  themeListeners.add(fn);
  return () => {
    themeListeners.delete(fn);
  };
}

export async function setUiTheme(theme: UiTheme): Promise<boolean> {
  try {
    assertSessionWritable();
  } catch {
    return false;
  }
  const { success } = await commitPrefs((current) => ({
    next: { ...current, uiTheme: theme },
    result: undefined,
  }));
  if (success) themeListeners.forEach((fn) => fn(theme));
  return success;
}

export function getHiddenCategoryIds(): string[] {
  return [...readPrefs().hiddenCategoryIds];
}

export function filterSelectableCategories<T extends { id: string }>(
  categories: readonly T[],
  preserveCategoryId?: string | null,
): T[] {
  const hidden = new Set(getHiddenCategoryIds());
  return categories.filter(
    (category) =>
      category.id === preserveCategoryId || !hidden.has(category.id),
  );
}

export async function setHiddenCategoryIds(
  hiddenIds: string[],
): Promise<boolean> {
  try {
    assertSessionWritable();
  } catch {
    return false;
  }
  const unique = Array.from(new Set(hiddenIds));
  const { success } = await commitPrefs((current) => ({
    next: { ...current, hiddenCategoryIds: unique },
    result: undefined,
  }));
  return success;
}

export async function toggleCategoryHidden(
  categoryId: string,
): Promise<{ success: boolean; isHidden: boolean }> {
  try {
    assertSessionWritable();
  } catch {
    return { success: false, isHidden: false };
  }
  const { success, result } = await commitPrefs((current) => {
    const willHide = !current.hiddenCategoryIds.includes(categoryId);
    return {
      next: {
        ...current,
        hiddenCategoryIds: willHide
          ? [...current.hiddenCategoryIds, categoryId]
          : current.hiddenCategoryIds.filter((id) => id !== categoryId),
      },
      result: willHide,
    };
  });
  return { success, isHidden: result };
}

export async function setInventoryLayout(
  layout: InventoryLayout,
): Promise<boolean> {
  try {
    assertSessionWritable();
  } catch {
    return false;
  }
  const { success } = await commitPrefs((current) => ({
    next: { ...current, inventoryLayout: layout },
    result: undefined,
  }));
  if (success) listeners.forEach((fn) => fn(layout));
  return success;
}

export async function toggleInventoryLayout(): Promise<{
  success: boolean;
  layout: InventoryLayout;
}> {
  try {
    assertSessionWritable();
  } catch {
    return { success: false, layout: getInventoryLayout() };
  }
  const { success, result } = await commitPrefs<InventoryLayout>((current) => {
    const layout: InventoryLayout =
      current.inventoryLayout === "list" ? "card" : "list";
    return {
      next: { ...current, inventoryLayout: layout },
      result: layout,
    };
  });
  if (success) listeners.forEach((fn) => fn(result));
  return { success, layout: result };
}

export function subscribeInventoryLayout(
  fn: (layout: InventoryLayout) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
