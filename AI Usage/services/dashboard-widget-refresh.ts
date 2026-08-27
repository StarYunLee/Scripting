import type { UsageCard } from "../models";
import type { RefreshOutcome } from "./refresh";

type SuccessfulRefreshOutcome = RefreshOutcome & {
  ok: true;
  source?: "live" | "cache";
};

export type DashboardRefreshResult = {
  cards: UsageCard[];
  hasErrors: boolean;
};

export function mergeDashboardRefreshOutcomes(
  cards: UsageCard[],
  outcomes: RefreshOutcome[],
  rebuild: (
    card: UsageCard,
    outcome: SuccessfulRefreshOutcome,
  ) => UsageCard | null,
): DashboardRefreshResult {
  const byKey = new Map(
    outcomes.map((outcome) => [
      `${outcome.provider}:${outcome.profileId}`,
      outcome,
    ]),
  );
  let hasErrors = false;
  const merged = cards.map((card) => {
    const outcome = byKey.get(card.key);
    if (!outcome) {
      hasErrors = true;
      return card;
    }
    if (!outcome.ok) {
      hasErrors = true;
      return {
        ...card,
        source: "error" as const,
        errorMessage: outcome.error?.message,
      };
    }
    const next = rebuild(card, outcome as SuccessfulRefreshOutcome);
    if (!next) {
      hasErrors = true;
      return card;
    }
    if (next.errorMessage) hasErrors = true;
    return next;
  });
  return { cards: merged, hasErrors };
}
