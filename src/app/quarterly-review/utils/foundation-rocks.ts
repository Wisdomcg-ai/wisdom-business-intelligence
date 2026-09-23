/**
 * First session, step 3 — what the owner says they were working on last quarter.
 *
 * Pure, so the mapping from "did it land?" to the stored review item can be
 * pinned by tests. A first-timer has no rocks to load, so these items are typed
 * from memory: they carry `selfReported` and they are the only rocks_review
 * items in the system that were never a rock.
 */
import type { RockReviewItem } from '../types';

/** What the owner says happened, in their words rather than the system's. */
export type FoundationOutcome = 'landed' | 'partly' | 'didnt';

export interface FoundationPriority {
  /** Stable across re-renders so a row keeps its place while being typed into. */
  id: string;
  title: string;
  outcome: FoundationOutcome | null;
  note: string;
}

/** A first session asks for three. More than that is a list, not a set of priorities. */
export const FOUNDATION_PRIORITY_LIMIT = 3;

export const OUTCOME_LABELS: Record<FoundationOutcome, string> = {
  landed: 'Got it done',
  partly: 'Partly there',
  didnt: 'Didn’t happen',
};

/**
 * How far it got, for the scorecard-style counts the close screen already shows.
 * "Partly" is the only honest middle: the owner is telling us it moved, not that
 * it is half a rock.
 */
const PROGRESS: Record<FoundationOutcome, number> = { landed: 100, partly: 50, didnt: 0 };

/**
 * `completed` or `carry_forward` — the two decisions that mean something here.
 *
 * Anything not finished carries forward rather than being dropped: the owner
 * chose to tell us about it, and the coach decides in the session whether it
 * becomes a rock. `drop` and `modify` are decisions about a rock the system
 * already holds, and there is no such rock in a first session.
 */
export function decisionFor(outcome: FoundationOutcome): RockReviewItem['decision'] {
  return outcome === 'landed' ? 'completed' : 'carry_forward';
}

const clean = (s: string | null | undefined): string => (s ?? '').trim();

/**
 * Turn the rows on screen into rocks_review items.
 *
 * A row with no title is not recorded — a blank line is not a priority the owner
 * failed. A row with a title but no answer yet is kept (they are mid-sentence),
 * with no decision inferred for them.
 */
export function toRocksReview(priorities: FoundationPriority[]): RockReviewItem[] {
  return priorities
    .filter(p => clean(p.title) !== '')
    .map((p, i) => ({
      rockId: p.id || `self-${i + 1}`,
      title: clean(p.title),
      // Asked for in a first session, not guessed at: nobody said who owns it.
      owner: '',
      successCriteria: '',
      progressPercentage: p.outcome ? PROGRESS[p.outcome] : 0,
      decision: p.outcome ? decisionFor(p.outcome) : 'carry_forward',
      outcomeNarrative: clean(p.note),
      lessonsLearned: '',
      selfReported: true,
    }));
}

/** Read the stored items back into rows, so the step survives a reload. */
export function fromRocksReview(items: RockReviewItem[] | null | undefined): FoundationPriority[] {
  return (items ?? [])
    .filter(i => clean(i.title) !== '')
    .map((i, idx) => ({
      id: i.rockId || `self-${idx + 1}`,
      title: i.title,
      outcome:
        i.decision === 'completed'
          ? 'landed'
          : i.progressPercentage > 0
            ? 'partly'
            : 'didnt',
      note: i.outcomeNarrative || '',
    }));
}

/** What the coach reads out: how many landed, and what is still open. */
export function summarise(priorities: FoundationPriority[]): {
  answered: number;
  landed: number;
  carried: number;
} {
  const named = priorities.filter(p => clean(p.title) !== '' && p.outcome);
  return {
    answered: named.length,
    landed: named.filter(p => p.outcome === 'landed').length,
    carried: named.filter(p => p.outcome !== 'landed').length,
  };
}
