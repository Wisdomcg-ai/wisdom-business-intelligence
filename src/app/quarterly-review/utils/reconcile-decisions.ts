/**
 * How step 4.2 merges the plan it loads with the decisions a review already
 * holds — pure, so the merge can be pinned without rendering the step.
 *
 * Found 25 Sep 2026 (JVJ Civil and Asphalt): a completed review, re-opened,
 * showed Training and KPI & Bonus Structure twice each in Sprint Planning, and
 * Performance Management System twice in 4.2's Available pool.
 */
import type { InitiativeAction, InitiativeDecision } from '../types';
import { fillSprintBlanks, titleKey } from './rocks-from-decisions';
import { isDroppedInitiative, livePlanRows } from '@/lib/initiatives/dropped-initiatives';

/** Rocks a review added itself: 'new-' in step 4.2, 'sprint-new-' in step 4.3. */
export function isAddedInReview(id: string | null | undefined): boolean {
  const s = String(id ?? '');
  return s.startsWith('new-') || s.startsWith('sprint-new-');
}

const quarterOf = (d: Pick<InitiativeDecision, 'quarterAssigned'>): string =>
  (d.quarterAssigned || 'unassigned').trim().toLowerCase();

const KEPT = new Set<InitiativeAction>(['keep', 'accelerate']);

/**
 * Merge the freshly loaded plan (`fresh`) with the review's own decisions.
 *
 * A saved initiative keeps the review's decision and sprint detail, with the
 * plan's current title/category/status — as before.
 *
 * A rock the review added itself has no row to reload, so it is carried over.
 * The one exception is the row that review's OWN completion saved for it:
 * completing saves the review's added rocks (syncRocks, syncNewInitiatives), and
 * re-opening then loaded that row AND kept the session's copy — the repeat JVJ
 * saw. When a row in the same quarter, of the same title, is new to this review,
 * it is that rock: the session's copy gives it the coach's decision and fills in
 * what it lacks, and is not listed a second time. One copy per row.
 *
 * The same holds for an initiative the coach PICKED for a quarter from
 * somewhere else in the plan — the 12-month list, or an earlier quarter's rock
 * carried forward. The sync files it under a quarter row of its own (the Goals
 * wizard's model) and leaves the original where it is, so re-loading finds that
 * quarter row, new to the review, and the original back in its own place (or,
 * for a 12-month initiative, out of the pool, which hides what a quarter holds).
 * The quarter row is the pick: it takes the coach's decision and sprint detail,
 * and the original is listed as the plan holds it. Without this the pick's
 * decision was dropped and its quarter row listed bare — and the next sync
 * wrote the bare copy over what the coach had set.
 *
 * A rock the coach took out of the quarter after the sync had filed it — a
 * Drop — takes that row with it: the row is listed once, as Drop, and is not a
 * rock again. The 4.3 background sync files a rock a few seconds after an edit,
 * so a rock added and then removed in Sprint Planning usually has a row by the
 * time 4.2 loads; it used to come back from it as a fresh 'keep'. A Drop takes
 * only a row this review created (`ownRows`, see createdByReview). A row of that
 * name the plan held already — the Goals wizard's — is listed as the plan holds
 * it, beside the Drop, for the coach to decide.
 *
 * A rock that is kept is filed under the quarter's live row of its title, never
 * one saved as cancelled: a rock re-added under a dropped rock's name is listed
 * beside the dropped one, as syncRocks gives it a row of its own (#604). And a
 * listing that keeps its rock claims a row before one that drops it, so a rock
 * re-added after it was removed takes the row, not the old Drop.
 *
 * Nothing else is merged. A row the review already held, or a second copy of
 * the same title, stays listed — step 4.3 flags repeats for the coach to choose
 * (Matt, 25 Sep 2026: alert, don't assume).
 *
 * 'sprint-new-' rocks (added in 4.3) used to be dropped here altogether, so a
 * rock added in Sprint Planning vanished when the coach went back to 4.2.
 */
export function reconcileDecisions(
  existing: InitiativeDecision[],
  fresh: InitiativeDecision[],
  /** The quarter rows this review's own sync created (createdByReview). */
  ownRows: ReadonlySet<string> = new Set()
): InitiativeDecision[] {
  const existingById = new Map(existing.map(d => [d.initiativeId, d]));
  const freshById = new Map(fresh.map(f => [f.initiativeId, f]));

  let reconciled = fresh.map(f => {
    const held = existingById.get(f.initiativeId);
    if (!held) return f;
    // For completed-in-1.3 items, lock decision to 'keep' (not overridable).
    const decision = f.completedInStep1 ? ('keep' as InitiativeAction) : held.decision;
    return {
      ...held, // why, outcome, tasks, milestones from 4.3
      ...f, // the plan's current title, category, status, progress
      decision,
      notes: held.notes || f.notes,
    };
  });

  // Per quarter and title: the first live row — the one a kept rock is filed
  // under — and the first row this review's own sync created.
  const liveAt = new Map<string, number>();
  const ownAt = new Map<string, number>();
  reconciled.forEach((d, index) => {
    const key = titleKey(d.title);
    if (!key) return;
    const at = `${quarterOf(d)}|${key}`;
    if (d.currentStatus !== 'cancelled' && !liveAt.has(at)) liveAt.set(at, index);
    if (ownRows.has(d.initiativeId) && !ownAt.has(at)) ownAt.set(at, index);
  });

  const added = (d: InitiativeDecision) => isAddedInReview(d.initiativeId);
  // A saved initiative the coach put in a quarter its own row is not in.
  const picked = (d: InitiativeDecision) => {
    const home = freshById.get(d.initiativeId);
    return !added(d) && quarterOf(d) !== 'unassigned' && (!home || quarterOf(home) !== quarterOf(d));
  };
  const keeps = (d: InitiativeDecision) => KEPT.has(d.decision);
  const claimers = existing.filter(d => added(d) || picked(d));

  const claimOf = new Map<InitiativeDecision, number>();
  const claimed = new Set<number>();
  for (const d of [...claimers.filter(keeps), ...claimers.filter(d => !keeps(d))]) {
    const key = titleKey(d.title);
    if (!key) continue;
    const at = `${quarterOf(d)}|${key}`;
    const index = keeps(d) ? liveAt.get(at) : ownAt.get(at);
    const saved = index === undefined ? undefined : reconciled[index];
    if (index === undefined || !saved || claimed.has(index) || existingById.has(saved.initiativeId)) continue;
    claimed.add(index);
    claimOf.set(d, index);
  }

  const carried: InitiativeDecision[] = [];
  for (const d of claimers) {
    const index = claimOf.get(d);
    if (index === undefined) {
      if (added(d)) carried.push(d);
      continue;
    }
    const saved = reconciled[index];
    const home = freshById.get(d.initiativeId);
    const merged = fillSprintBlanks(saved, d);
    reconciled = reconciled.map((r, i) => {
      if (i === index) return { ...merged, decision: saved.completedInStep1 ? merged.decision : d.decision };
      // The row the pick came from, listed where the plan holds it and as it holds it.
      if (home && r.initiativeId === d.initiativeId) return home;
      return r;
    });
  }

  return [...reconciled, ...carried];
}

/** A row of one of the plan's quarters, as step 4.2 loads it. */
export interface PlanQuarterRow {
  id: string;
  title: string;
  category?: string | null;
  status?: string | null;
  progress_percentage?: number | null;
  assigned_to?: string | null;
  source?: string | null;
  idea_type?: string | null;
}

/**
 * One of a quarter's rows as step 4.2 lists it.
 *
 * A row saved as cancelled — a rock the coach dropped — is listed as Drop. It
 * used to be listed as a fresh 'keep' like every other row: a dropped rock was
 * on the plate again the next time 4.2 loaded, and the completion after that
 * saved it as in progress (syncInitiativeChanges writes a kept listing as
 * 'in_progress'). Efficient Living's fifteen cancelled repeats of its Q1 rocks
 * (25 Sep 2026) would have come back that way at its next review.
 */
export function listQuarterRow(row: PlanQuarterRow, quarterId: string): InitiativeDecision {
  return {
    initiativeId: row.id,
    title: row.title,
    category: row.category || 'marketing',
    currentStatus: row.status || 'active',
    progressPercentage: row.progress_percentage || 0,
    decision: isDroppedInitiative(row) ? 'kill' : 'keep',
    notes: row.assigned_to ? `[Assigned: ${row.assigned_to}]` : '',
    quarterAssigned: quarterId,
    source: row.source as InitiativeDecision['source'],
    ideaType: row.idea_type as InitiativeDecision['ideaType'],
  };
}

/** A row of the plan's ideas / 12-month lists, as step 4.2 loads it. */
export interface PoolRow {
  id: string;
  title?: string | null;
  step_type?: string | null;
}

/**
 * One Available entry per initiative.
 *
 * The Goals wizard keeps an initiative as an idea (`strategic_ideas`) AND as a
 * 12-month item (`twelve_month`) — two rows, one title. Loading both showed
 * JVJ's Performance Management System twice. The 12-month row is the one kept:
 * it is the plan, the idea is where it came from. Order is unchanged.
 */
export function onePoolEntryPerInitiative<T extends PoolRow>(rows: T[]): T[] {
  const chosen = new Map<string, T>();
  const keyOf = (r: T) => titleKey(r.title) || `id:${r.id}`;
  for (const r of rows) {
    const key = keyOf(r);
    const held = chosen.get(key);
    if (!held || (held.step_type !== 'twelve_month' && r.step_type === 'twelve_month')) chosen.set(key, r);
  }
  return rows.filter(r => chosen.get(keyOf(r)) === r);
}


/** A quarter row as step 4.2's Available pool checks it: whether it holds an initiative. */
export interface HoldingRow {
  id: string;
  title?: string | null;
  status?: string | null;
}

/**
 * The ideas and 12-month initiatives step 4.2 offers as Available: one entry
 * per initiative (onePoolEntryPerInitiative), strategic ones only, and none a
 * quarter already holds — by id, or by title, because the Goals wizard gives a
 * quarter its own copy of an initiative under a new id.
 *
 * Only a live quarter row holds a title. A quarter row saved as cancelled is a
 * rock the coach took out of that quarter, not an initiative taken out of the
 * plan (#605: Drop on a picked card drops the quarter's rock, and the 12-month
 * initiative is dropped in Available). So the 12-month initiative is offered
 * again, to be picked for another quarter or dropped itself — as the Goals
 * wizard's Step 4 offers it, since it no longer loads the dropped copy. The
 * dropped copy's title used to hide it from Available for good.
 */
export function availablePool<T extends PoolRow & { idea_type?: string | null }>(
  poolRows: T[],
  quarterRows: readonly HoldingRow[],
): T[] {
  // The same row is never listed twice, whatever its status.
  const heldIds = new Set(quarterRows.map(r => r.id));
  const heldTitles = new Set(livePlanRows(quarterRows).map(r => titleKey(r.title)).filter(Boolean));
  return onePoolEntryPerInitiative(poolRows).filter(
    r => !heldIds.has(r.id) && !heldTitles.has(titleKey(r.title)) && r.idea_type !== 'operational'
  );
}

/**
 * One of the plan's ideas or 12-month initiatives as step 4.2's Available pool
 * lists it: the listing a quarter row gets, in no quarter.
 *
 * A row saved as cancelled — an initiative the coach dropped from Available —
 * is listed as Drop, as a dropped quarter row is. It used to be listed as a
 * fresh 'keep': offered again at the next review, and the completion after that
 * saved it as in progress (syncInitiativeChanges wrote a kept listing outside
 * the planned quarter back by id), so a dropped initiative came back onto the
 * plan without anyone choosing it.
 */
export function listPoolRow(row: PlanQuarterRow): InitiativeDecision {
  return listQuarterRow(row, 'unassigned');
}

/**
 * The Available listings "Distribute" places in quarters — never one the coach
 * dropped. Available lists a dropped initiative as Drop (listPoolRow), and
 * spreading it across the quarters would put it back in the plan's columns,
 * taking one of a quarter's five places.
 */
export function listingsToDistribute(decisions: InitiativeDecision[]): InitiativeDecision[] {
  return decisions.filter(d => quarterOf(d) === 'unassigned' && d.decision !== 'kill');
}
