export type AiVisionTask = {
  id: number;
  signal: { readonly aborted: boolean };
  cancel(): void;
};
/** Task identity is independent of render state. Old finally cannot release a newer task. */
export class AiVisionTaskCoordinator {
  private active: AiVisionTask | null = null;
  private generation = 0;
  private alive = true;
  get busy(): boolean {
    return this.active !== null;
  }
  begin(
    factory: () => { signal: { readonly aborted: boolean }; abort(): void },
  ): AiVisionTask | null {
    if (!this.alive || this.active) return null;
    const controller = factory();
    const task = {
      id: ++this.generation,
      signal: controller.signal,
      cancel: () => controller.abort(),
    };
    this.active = task;
    return task;
  }
  current(task: AiVisionTask): boolean {
    return this.alive && this.active === task && !task.signal.aborted;
  }
  finish(task: AiVisionTask): boolean {
    if (this.active !== task) return false;
    this.active = null;
    return this.alive;
  }
  cancel(): void {
    const task = this.active;
    this.active = null;
    task?.cancel();
  }
  suspend(): void {
    this.alive = false;
    this.cancel();
  }
  resume(): void {
    this.alive = true;
  }
}
