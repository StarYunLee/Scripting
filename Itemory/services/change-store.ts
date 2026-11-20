type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();
let dataVersion = 1;

export function getDataVersion(): number {
  return dataVersion;
}

export function notifyDataChanged(): void {
  dataVersion++;
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.log(`[ChangeStore] Listener error: ${String(e)}`);
    }
  }
}

export function subscribeDataChanges(listener: ChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
