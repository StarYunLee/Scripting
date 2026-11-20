type Listener = () => void;
const listeners = new Set<Listener>();
let currentDay = "";
let timer: number | null = null;

function localDay(): string {
  const d=new Date();const p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function check(): void {
  const next=localDay();if(!currentDay){currentDay=next;return}if(next===currentDay)return;currentDay=next;for(const listener of listeners){try{listener()}catch(error){console.log(`[DayChange] ${String(error)}`)}}
}
function schedule(): void {
  if (timer !== null || listeners.size === 0) return;
  timer=setTimeout(()=>{timer=null;check();schedule()},60000);
}
export function subscribeDayChanges(listener:Listener):()=>void{
  listeners.add(listener);check();schedule();
  return()=>{listeners.delete(listener);if(listeners.size===0&&timer!==null){clearTimeout(timer);timer=null}};
}
export function checkDayChangeNow():void{check()}
