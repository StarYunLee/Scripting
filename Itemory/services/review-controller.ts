import type { ReviewPageResult, ReviewQuery, ReviewQueryOptions } from "./review";

type Operation = "replace" | "refresh" | "append";
export interface ReviewSnapshot extends ReviewPageResult {
  query: ReviewQuery;
  nextOffset: number;
  dataRevision: number;
}
export interface ReviewState {
  desired: ReviewQuery;
  snapshot: ReviewSnapshot | null;
  operation: Operation | null;
  error: { kind: Operation; message: string } | null;
  stale: boolean;
  showProgress: boolean;
}
type Loader = (options: ReviewQueryOptions, current: () => boolean) => Promise<ReviewPageResult>;
const sameQuery = (a: ReviewQuery, b: ReviewQuery) => a.year === b.year && a.direction === b.direction;

/** Local to the review page: do not change inventory's established query/scroll behavior. */
export class ReviewController {
  state: ReviewState = {
    desired: { year: "all", direction: "desc" }, snapshot: null,
    operation: null, error: null, stale: false, showProgress: false,
  };
  private generation = 0;
  private revision = 0;
  private disposed = false;
  private listener: ((state: ReviewState) => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private load: Loader, private pageSize = 50) {}

  subscribe(listener: (state: ReviewState) => void): () => void {
    this.listener = listener;
    listener(this.state);
    return () => { this.listener = null; };
  }
  private update(patch: Partial<ReviewState>): void {
    this.state = { ...this.state, ...patch };
    this.listener?.(this.state);
  }
  private invalidate(): void {
    this.generation++;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    if (this.progressTimer !== null) clearTimeout(this.progressTimer);
    this.refreshTimer = this.progressTimer = null;
  }
  start(): void { void this.run("replace"); }
  select(patch: Partial<ReviewQuery>): void {
    if (this.disposed) return;
    const desired = { ...this.state.desired, ...patch };
    if (sameQuery(desired, this.state.desired)) return;
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
  async refresh(): Promise<void> {
    await this.run(this.state.snapshot ? "refresh" : "replace");
  }
  append(): void {
    const s = this.state;
    if (this.disposed || s.operation || s.stale || !s.snapshot?.hasMore ||
        !sameQuery(s.snapshot.query, s.desired)) return;
    void this.run("append");
  }
  retry(): void {
    if (this.state.operation) return;
    if (this.state.error?.kind === "append") this.append();
    else void this.refresh();
  }
  canOpen(): boolean {
    return !this.disposed && !!this.state.snapshot && this.state.operation !== "replace" &&
      sameQuery(this.state.snapshot.query, this.state.desired);
  }
  dispose(): void {
    this.disposed = true;
    this.invalidate();
    this.listener = null;
  }
  private async run(kind: Operation): Promise<void> {
    if (this.disposed) return;
    this.invalidate();
    const generation = this.generation, revision = this.revision;
    const query = { ...this.state.desired }, base = this.state.snapshot;
    const offset = kind === "append" ? base!.nextOffset : 0;
    const limit = kind === "refresh" && base && sameQuery(base.query, query)
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
      // The year disappears only after a confirmed successful DB read.
      if (query.year !== "all" && !result.years.includes(query.year)) {
        this.select({ year: "all" });
        return;
      }
      const seen = new Set(kind === "append" ? base!.items.map(item => item.id) : []);
      const added = result.items.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      this.update({ snapshot: {
        ...result, items: kind === "append" ? [...base!.items, ...added] : added,
        query, nextOffset: offset + result.items.length, dataRevision: revision,
      }, stale: false, error: null });
    } catch (error) {
      if (!current()) return;
      this.update({
        desired: base && !sameQuery(base.query, query) ? base.query : query,
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
