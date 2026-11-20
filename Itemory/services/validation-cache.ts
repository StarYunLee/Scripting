/** Bounded LRU of shared validations. Only successful values survive settlement. */
export class ValidationCache<T> {
  private entries = new Map<string, Promise<T>>();
  constructor(private capacity: number, private cacheable: (value: T) => boolean) {}
  invalidate(key?: string): void {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }
  resolve(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const promise = Promise.resolve().then(load);
    this.entries.set(key, promise);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    const remove = () => {
      // Invalidated/evicted work cannot remove or repopulate a newer entry.
      if (this.entries.get(key) === promise) this.entries.delete(key);
    };
    void promise.then(value => { if (!this.cacheable(value)) remove(); }, remove);
    return promise;
  }
}
