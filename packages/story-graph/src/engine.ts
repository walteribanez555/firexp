/**
 * Pure story-graph engine functions.
 *
 * All functions are free of I/O, side effects, and external dependencies.
 * They mirror the behaviour of:
 *   - apps/relay/src/modules/rooms/rooms.service.ts  (evaluate, applyFlags, pickVariant)
 *   - apps/fire-hack/.../domain/StoryEngine.kt       (evaluate, applyFlags, resolveWinner)
 */

import type {
  Flags,
  FlagSet,
  StoryChapter,
  StoryVariant,
  DecisionOption,
  EpisodeDetail,
} from '@fire-stick/types';

import { type Clause, type Cond, parseWhen } from './condition.js';

// ── Condition evaluation ──────────────────────────────────────────────────────

/**
 * Evaluate a single `Clause` against the current flags.
 * Missing flags default to 0 (mirrors relay & Kotlin behaviour).
 */
function evaluateClause(clause: Clause, flags: Flags): boolean {
  const a = flags[clause.flag] ?? 0;
  const b = clause.value;
  switch (clause.op) {
    case 'gte': return a >= b;
    case 'lte': return a <= b;
    case 'gt':  return a > b;
    case 'lt':  return a < b;
    case 'eq':  return a === b;
    case 'ne':  return a !== b;
  }
}

/**
 * Evaluate a `Cond` (or a legacy string expression) against the current flags.
 *
 * - `'default'` always returns `true`.
 * - A string is first parsed with `parseWhen`.
 * - `{ all: [...] }` requires every clause to be true.
 * - `{ any: [...] }` requires at least one clause to be true.
 * - A bare `Clause` is evaluated directly.
 *
 * @throws if a legacy string contains an invalid clause.
 */
export function evaluateWhen(cond: Cond | string, flags: Flags): boolean {
  const resolved: Cond = typeof cond === 'string' ? parseWhen(cond) : cond;

  if (resolved === 'default') return true;

  if ('all' in resolved) {
    return resolved.all.every((c) => evaluateClause(c, flags));
  }
  if ('any' in resolved) {
    return resolved.any.some((c) => evaluateClause(c, flags));
  }
  // bare Clause
  return evaluateClause(resolved, flags);
}

// ── Flag mutations ────────────────────────────────────────────────────────────

/**
 * Apply a `FlagSet` to `flags` and return a **new** object (immutable).
 *
 * - String values are relative mutations: `"+1"` adds 1, `"-2"` subtracts 2.
 * - Number values are absolute assignments.
 *
 * Mirrors the mutable `applyFlags` in the relay service but returns a new
 * object so callers can safely compare before/after without copying manually.
 */
export function applySet(flags: Flags, set: FlagSet = {}): Flags {
  const next: Flags = { ...flags };
  for (const [k, op] of Object.entries(set)) {
    if (typeof op === 'number') {
      next[k] = op;
    } else {
      next[k] = (next[k] ?? 0) + Number(op);
    }
  }
  return next;
}

// ── Variant selection ─────────────────────────────────────────────────────────

/**
 * Select the first variant whose `when` condition is satisfied by `flags`.
 *
 * Mirrors `pickVariant` in the relay and `pickVariant` in StoryEngine.kt.
 * Returns `null` if no variant matches (the chapter data is invalid — the last
 * variant should always be `"default"`).
 */
export function selectVariant(chapter: StoryChapter, flags: Flags): StoryVariant | null {
  for (const variant of chapter.variants) {
    if (evaluateWhen(variant.when, flags)) return variant;
  }
  return null;
}

// ── Vote resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a map of viewer-to-gesture votes into the winning gesture string.
 *
 * Rules (mirrors StoryEngine.kt `resolveWinner`):
 * 1. If the tally is empty, return `'default'`.
 * 2. Count votes per gesture.
 * 3. If there is a single clear majority winner **and** that gesture exists in
 *    `options`, return that gesture string.
 * 4. Otherwise (tie, unknown gesture), return `'default'`.
 *
 * @param votes   Map from viewer-id (any string key) to gesture string.
 * @param options The decision's valid options — only gestures listed here can win.
 */
export function resolveVotes(
  votes: Record<string, string>,
  options: DecisionOption[],
): string {
  const entries = Object.values(votes);
  if (entries.length === 0) return 'default';

  const counts: Record<string, number> = {};
  for (const gesture of entries) {
    counts[gesture] = (counts[gesture] ?? 0) + 1;
  }

  const max = Math.max(...Object.values(counts));
  const topGestures = Object.keys(counts).filter((g) => counts[g] === max);

  // Tie → default
  if (topGestures.length !== 1) return 'default';

  const winner = topGestures[0];
  // Must be one of the declared options
  return options.some((o) => o.gesture === winner) ? winner : 'default';
}

// ── Graph analysis ────────────────────────────────────────────────────────────

/**
 * Return variants in `chapter` that can never be selected because an earlier
 * variant always matches first (or the condition is structurally unreachable).
 *
 * A variant is shadowed when:
 *   - It is not `"default"` and every path through earlier variants already
 *     covers the full flag space — i.e. some earlier variant is `"default"`.
 *   - It appears after a `"default"` variant.
 *
 * Note: full satisfiability analysis (e.g. two clauses with contradictory
 * ranges covering all integers) is not attempted here. The check is structural:
 * any variant that comes after a `"default"` is definitively unreachable.
 */
export function findShadowedVariants(chapter: StoryChapter): StoryVariant[] {
  const shadowed: StoryVariant[] = [];
  let defaultSeen = false;

  for (const variant of chapter.variants) {
    if (defaultSeen) {
      // Any variant after a `default` is unreachable
      shadowed.push(variant);
      continue;
    }
    if (variant.when.trim() === 'default') {
      defaultSeen = true;
    }
  }

  return shadowed;
}

/**
 * Identify decisions that are inconsequential — i.e. their outcome can never
 * change which variant is selected in any later chapter.
 *
 * **Heuristic used** (pragmatic / O(chapters × decisions)):
 *   A decision is considered inconsequential if none of the flag keys it may
 *   mutate (across ALL of its options including default) appear in the `when`
 *   expressions of any **later** chapter's variants.
 *
 * This is a conservative under-approximation: it will never report a
 * consequential decision as inconsequential (no false positives). However, it
 * may miss truly inconsequential decisions where the flags appear in a later
 * `when` but can never actually alter its truth value given the reachable flag
 * ranges (no false negatives of the opposite kind). A full SMT-based analysis
 * would be required to close that gap.
 *
 * Returns an array of `{ chapterId, decisionId }` tuples.
 */
export function findInconsequentialDecisions(
  episode: EpisodeDetail,
): { chapterId: string; decisionId: string }[] {
  const { chapters } = episode;
  const result: { chapterId: string; decisionId: string }[] = [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const laterChapters = chapters.slice(ci + 1);

    // Collect all flag keys referenced in later chapters' variant conditions
    const laterFlagKeys = new Set<string>();
    for (const laterChapter of laterChapters) {
      for (const variant of laterChapter.variants) {
        try {
          collectConditionFlags(parseWhen(variant.when), laterFlagKeys);
        } catch {
          // Skip unparseable conditions
        }
      }
    }

    for (const decision of chapter.decisions) {
      // Collect all flag keys this decision can mutate
      const mutatedKeys = new Set<string>();
      for (const option of decision.options) {
        for (const key of Object.keys(option.set)) mutatedKeys.add(key);
      }
      for (const key of Object.keys(decision.default.set)) mutatedKeys.add(key);

      // A decision is inconsequential if none of its mutated flags appear later
      const isInconsequential = mutatedKeys.size === 0 || ![...mutatedKeys].some((k) => laterFlagKeys.has(k));
      if (isInconsequential) {
        result.push({ chapterId: chapter.id, decisionId: decision.id });
      }
    }
  }

  return result;
}

function collectConditionFlags(cond: Cond, out: Set<string>): void {
  if (cond === 'default') return;
  if ('all' in cond) { cond.all.forEach((c) => out.add(c.flag)); return; }
  if ('any' in cond) { cond.any.forEach((c) => out.add(c.flag)); return; }
  out.add(cond.flag);
}

// ── Reachable endings ─────────────────────────────────────────────────────────

/**
 * Walk all combinations of questionnaire answers and decision votes (bounded
 * enumeration) and collect the set of final-chapter variant `tag`s (or `when`
 * strings when `tag` is absent) that are reachable.
 *
 * Bound: each decision is explored with the default path and each individual
 * option winning (one-at-a-time). Full combinatorial expansion across decisions
 * is intentionally avoided — it would be 2^N for N decisions. Instead we
 * perform a breadth-first walk through chapters applying one option at a time
 * to produce an O(chapters × options) bounded search.
 *
 * For a full reachability analysis, callers should enumerate all
 * `DecisionOption` set combinations explicitly. This function provides a
 * practical approximation sufficient for the dashboard's "reachable endings"
 * panel.
 */
export function reachableEndings(episode: EpisodeDetail): string[] {
  const { chapters, questionnaire, flags: baseFlags } = episode;

  // Build starting flag states from questionnaire options
  const questionnaireStates: Flags[] = buildQuestionnaireStates(baseFlags, questionnaire);

  const endings = new Set<string>();
  const lastChapter = chapters[chapters.length - 1];
  if (!lastChapter) return [];

  // BFS over (flagState) frontiers
  for (const initFlags of questionnaireStates) {
    const frontier: Flags[] = [initFlags];

    for (let ci = 0; ci < chapters.length; ci++) {
      const chapter = chapters[ci];
      const isLast = ci === chapters.length - 1;
      const nextFrontier: Flags[] = [];

      for (const flags of frontier) {
        // For each chapter, try all decision outcomes (default + each option)
        const decisionOutcomes = expandDecisions(flags, chapter.decisions);

        for (const outcomeFlags of decisionOutcomes) {
          if (isLast) {
            const variant = selectVariant(chapter, outcomeFlags);
            if (variant) {
              endings.add(variant.tag ?? variant.when);
            }
          } else {
            nextFrontier.push(outcomeFlags);
          }
        }
      }

      if (!isLast) {
        // Deduplicate frontier by JSON to bound growth
        const seen = new Set<string>();
        for (const f of nextFrontier) {
          const key = JSON.stringify(Object.entries(f).sort());
          if (!seen.has(key)) { seen.add(key); frontier.push(f); }
        }
        // Replace frontier
        frontier.splice(0, frontier.length, ...nextFrontier);
      }
    }
  }

  return [...endings].sort();
}

/**
 * For each questionnaire question, expand all option combinations into initial
 * flag states. Bounded: each question has a small set of options; combination
 * count = product of option counts.
 */
function buildQuestionnaireStates(
  base: Flags,
  questionnaire: EpisodeDetail['questionnaire'],
): Flags[] {
  if (!questionnaire.length) return [{ ...base }];

  let states: Flags[] = [{ ...base }];
  for (const question of questionnaire) {
    const next: Flags[] = [];
    for (const flags of states) {
      if (question.options.length === 0) {
        next.push(flags);
      } else {
        for (const option of question.options) {
          next.push(applySet(flags, option.flags));
        }
      }
    }
    states = next;
  }
  return states;
}

/**
 * For a list of decisions in a chapter, produce all flag states reachable by
 * applying each decision's outcomes (default + each option) sequentially.
 */
function expandDecisions(
  flags: Flags,
  decisions: StoryChapter['decisions'],
): Flags[] {
  let states: Flags[] = [flags];
  for (const decision of decisions) {
    const next: Flags[] = [];
    for (const f of states) {
      // Try the default path
      next.push(applySet(f, decision.default.set));
      // Try each option
      for (const option of decision.options) {
        next.push(applySet(f, option.set));
      }
    }
    states = next;
  }
  return states;
}
