import type { InventoryPageResult, InventoryQueryOptions } from "./queries";

export type InventoryQuery = Required<Omit<InventoryQueryOptions, "offset" | "limit">>;
export const DEFAULT_INVENTORY_QUERY: InventoryQuery = {
  categoryId: "all", statusFilter: "all", keyword: "", sortField: "created", sortDirection: "desc",
};
export function inventoryQueryKey(q: InventoryQuery): string {
  return JSON.stringify([q.categoryId, q.statusFilter, q.keyword.trim(), q.sortField, q.sortDirection]);
}
export interface InventorySnapshot extends InventoryPageResult {
  query: InventoryQuery;
  queryKey: string;
  nextOffset: number;
  dataRevision: number;
}
export interface InventoryState {
  desired: InventoryQuery;
  snapshot: InventorySnapshot | null;
  operation: "replace" | "refresh" | "append" | null;
  error: { kind: "replace" | "refresh" | "append"; message: string } | null;
  stale: boolean;
  showProgress: boolean;
}
type Loader = (options: InventoryQueryOptions, isCurrent: () => boolean) => Promise<InventoryPageResult>;

/** Owns request arbitration independently of the host UI and its render cadence. */
export class InventoryController {
  state: InventoryState = {
    desired: { ...DEFAULT_INVENTORY_QUERY }, snapshot: null, operation: null,
    error: null, stale: false, showProgress: false,
  };
  private generation = 0;
  private revision = 0;
  private disposed = false;
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private listener: ((state: InventoryState) => void) | null = null;
  constructor(private load: Loader, private pageSize = 50) {}
  subscribe(listener: (state: InventoryState) => void): () => void {
    this.listener = listener;
    listener(this.state);
    return () => { this.listener = null; };
  }
  private update(patch: Partial<InventoryState>): void {
    this.state = { ...this.state, ...patch };
    this.listener?.(this.state);
  }
  private invalidate(): void {
    this.generation++;
    if (this.progressTimer !== null) clearTimeout(this.progressTimer);
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.progressTimer = this.refreshTimer = null;
  }
  start(): void { void this.run("replace"); }
  select(patch: Partial<InventoryQuery>): void {
    if (this.disposed) return;
    const desired = { ...this.state.desired, ...patch };
    desired.keyword = desired.keyword.trim();
    if (inventoryQueryKey(desired) === inventoryQueryKey(this.state.desired)) return;
    this.update({ desired });
    void this.run("replace");
  }
  dataChanged(): void {
    if (this.disposed) return;
    this.revision++;
    this.invalidate();
    this.update({ stale: true, operation: "refresh", error: null, showProgress: false });
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.run("refresh");
    }, 40);
  }
  append(): void {
    const s = this.state;
    if (s.operation || s.stale || !s.snapshot?.hasMore ||
        s.snapshot.queryKey !== inventoryQueryKey(s.desired)) return;
    void this.run("append");
  }
  retry(): void {
    if (this.state.operation) return;
    if (this.state.error?.kind === "append") this.append();
    else void this.run(this.state.snapshot ? "refresh" : "replace");
  }
  canOpen(): boolean {
    return !this.disposed && !!this.state.snapshot &&
      this.state.operation !== "replace" &&
      this.state.snapshot.queryKey === inventoryQueryKey(this.state.desired);
  }
  dispose(): void {
    this.disposed = true;
    this.invalidate();
    this.listener = null;
  }
  private async run(kind: "replace" | "refresh" | "append"): Promise<void> {
    if (this.disposed) return;
    this.invalidate();
    const generation = this.generation;
    const revision = this.revision;
    const query = { ...this.state.desired };
    const queryKey = inventoryQueryKey(query);
    const base = this.state.snapshot;
    const sameQuery = base?.queryKey === queryKey;
    const offset = kind === "append" ? base!.nextOffset : 0;
    const limit = kind === "refresh" && sameQuery
      ? Math.max(this.pageSize, base.nextOffset) : this.pageSize;
    const current = () => !this.disposed && generation === this.generation && revision === this.revision;
    this.update({ operation: kind, error: null, showProgress: false });
    if (base && kind !== "append") {
      this.progressTimer = setTimeout(() => {
        if (current()) this.update({ showProgress: true });
      }, 150);
    }
    try {
      const result = await this.load({ ...query, offset, limit }, current);
      if (!current()) return;
      // Deleted categories must be normalized against a successful DB result,
      // not an empty/stale category array during initial rendering.
      if (query.categoryId !== "all" && query.categoryId !== "uncategorized" &&
          !result.categories.some(category => category.id === query.categoryId)) {
        this.select({ categoryId: "all" });
        return;
      }
      const seen = new Set(kind === "append" ? base!.cards.map(card => card.item.id) : []);
      const added = result.cards.filter(card => {
        if (seen.has(card.item.id)) return false;
        seen.add(card.item.id);
        return true;
      });
      const snapshot: InventorySnapshot = {
        ...result, cards: kind === "append" ? [...base!.cards, ...added] : added,
        query, queryKey, nextOffset: offset + result.cards.length, dataRevision: revision,
      };
      this.update({ snapshot, stale: false, error: null });
    } catch (error) {
      if (!current()) return;
      const rollback = base && base.queryKey !== queryKey;
      this.update({
        desired: rollback ? base.query : query,
        stale: this.state.stale || (!!base && base.dataRevision !== revision),
        error: { kind, message: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      if (current()) {
        if (this.progressTimer !== null) clearTimeout(this.progressTimer);
        this.progressTimer = null;
        this.update({ operation: null, showProgress: false });
      }
    }
  }
}
