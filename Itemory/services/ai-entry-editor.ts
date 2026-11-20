import type { AiEntrySession, AiEntrySnapshot } from "./ai-entry-session";

export type AiEntryEditorController = {
  connect(): () => void;
  beginPicking(): boolean;
  endPicking(): void;
  manualAccepted(): Promise<void>;
  retryImage(): Promise<boolean>;
  hasPendingImage(): boolean;
  settle(): Promise<void>;
  freeze(ignoreGenerated: boolean): Promise<void>;
  releaseSave(): void;
  close(): void;
};
/** Pure arbitration: never writes saved records, never starts requests or applies fields. */
export function createAiEntryEditorController(
  session: AiEntrySession,
  callbacks: {
    current(): boolean;
    prepare(image: UIImage): Promise<string>;
    apply(filename: string): void;
    discard(filename: string): Promise<void>;
    changed(snapshot: AiEntrySnapshot, preparing: boolean): void;
    failed(error: unknown): void;
  },
): AiEntryEditorController {
  let closed = false,
    manual = false,
    frozen = false,
    picking = false;
  let revision = 0,
    appliedGeneration = -1;
  let appliedFilename: string | null = null;
  let queued: AiEntrySnapshot | null = null;
  let work: Promise<void> | null = null;
  let unsubscribe: (() => void) | null = null;
  const current = () =>
    !closed &&
    !manual &&
    !frozen &&
    callbacks.current() &&
    !session.getSnapshot().closed;
  const eligible = (snapshot: AiEntrySnapshot) =>
    current() &&
    snapshot.owner === "editor" &&
    snapshot.cutoutGeneration === session.getSnapshot().cutoutGeneration &&
    snapshot.cutoutStatus === "success" &&
    !!snapshot.result.cutout?.cutout?.image;
  const pump = () => {
    if (!queued || work || picking || !eligible(queued)) return;
    const snapshot = queued;
    queued = null;
    if (snapshot.cutoutGeneration === appliedGeneration) return;
    const expected = revision;
    callbacks.changed(snapshot, true);
    work = (async () => {
      let filename: string | null = null;
      try {
        filename = await callbacks.prepare(
          snapshot.result.cutout!.cutout!.image,
        );
        if (expected !== revision || picking || !eligible(snapshot)) {
          await callbacks.discard(filename);
          // A picker opened during preparation must not lose an eligible result.
          if (picking && eligible(snapshot)) queued = snapshot;
          return;
        }
        callbacks.apply(filename);
        appliedFilename = filename;
        appliedGeneration = snapshot.cutoutGeneration;
      } catch (error) {
        if (current() && expected === revision) {
          appliedGeneration = snapshot.cutoutGeneration;
          callbacks.failed(error);
        }
      }
    })().finally(() => {
      work = null;
      if (!closed && callbacks.current())
        callbacks.changed(session.getSnapshot(), false);
      pump();
    });
  };
  const receive = (snapshot: AiEntrySnapshot) => {
    if (closed || !callbacks.current()) return;
    if (snapshot.closed) {
      // Close is a terminal state: nothing may stay queued or "preparing", so a
      // disposed session can never leave the editor waiting for an image.
      queued = null;
      callbacks.changed(snapshot, false);
      return;
    }
    callbacks.changed(snapshot, !!work);
    if (eligible(snapshot) && snapshot.cutoutGeneration !== appliedGeneration) {
      queued = snapshot;
      pump();
    }
  };
  return {
    connect() {
      if (!closed && !unsubscribe) unsubscribe = session.subscribe(receive);
      return () => {
        unsubscribe?.();
        unsubscribe = null;
      };
    },
    beginPicking() {
      if (closed || frozen || picking || !callbacks.current()) return false;
      picking = true;
      return true;
    },
    endPicking() {
      picking = false;
      pump();
    },
    async manualAccepted() {
      manual = true;
      revision++;
      queued = null;
      appliedFilename = null;
      session.ignoreCutout();
      await work;
    },
    async retryImage() {
      if (
        closed ||
        frozen ||
        picking ||
        work ||
        !callbacks.current() ||
        session.getSnapshot().closed
      )
        return false;
      const previousManual = manual;
      revision++;
      queued = null;
      appliedGeneration = -1;
      manual = false;
      try {
        const started = await session.retry("cutout");
        if (!started) manual = previousManual;
        return started;
      } catch (error) {
        manual = previousManual;
        throw error;
      }
    },
    hasPendingImage() {
      if (closed || manual || frozen) return false;
      const snapshot = session.getSnapshot();
      // A closed session is terminal: it can no longer deliver an image, so it
      // must not keep Save waiting behind an "image still generating" prompt.
      if (snapshot.closed) return false;
      return (
        !!work ||
        !!queued ||
        ["idle", "running"].includes(snapshot.cutoutStatus) ||
        (snapshot.cutoutStatus === "success" &&
          appliedGeneration !== snapshot.cutoutGeneration)
      );
    },
    async settle() {
      await work;
    },
    async freeze(ignoreGenerated) {
      // Freeze acceptance before ANY command preparation; late results cannot mutate payload.
      frozen = true;
      revision++;
      queued = null;
      if (ignoreGenerated) session.ignoreCutout();
      await work;
      if (ignoreGenerated && !manual && appliedFilename) {
        const filename = appliedFilename;
        appliedFilename = null;
        await callbacks.discard(filename);
      }
    },
    releaseSave() {
      if (!closed) {
        frozen = false;
        receive(session.getSnapshot());
      }
    },
    close() {
      if (closed) return;
      closed = true;
      revision++;
      queued = null;
      unsubscribe?.();
      unsubscribe = null;
      session.close();
    },
  };
}
