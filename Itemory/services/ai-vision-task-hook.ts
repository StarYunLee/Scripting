import {
  AbortController,
  useEffect,
  useRef,
  type AbortSignal,
} from "scripting";
import { AiVisionTaskCoordinator, type AiVisionTask } from "./ai-vision-task";
export type AiVisionUiTask = AiVisionTask & { signal: AbortSignal };
export function useAiVisionTasks() {
  const ref = useRef<AiVisionTaskCoordinator | null>(null);
  if (!ref.current) ref.current = new AiVisionTaskCoordinator();
  const tasks = ref.current;
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  function clearTimers() {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }
  function suspend() {
    tasks.suspend();
    clearTimers();
  }
  useEffect(() => {
    tasks.resume();
    return suspend;
  }, []);
  return {
    busy: () => tasks.busy,
    begin: () =>
      tasks.begin(() => new AbortController()) as AiVisionUiTask | null,
    current: (task: AiVisionTask) => tasks.current(task),
    finish: (task: AiVisionTask) => tasks.finish(task),
    cancel: () => {
      tasks.cancel();
      clearTimers();
    },
    suspend,
    resume: () => tasks.resume(),
    later: (work: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.current = timers.current.filter((x) => x !== timer);
        work();
      }, ms);
      timers.current.push(timer);
    },
  };
}
