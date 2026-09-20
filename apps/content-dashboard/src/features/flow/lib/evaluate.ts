/**
 * Thin re-export shim — all evaluation logic lives in @fire-stick/story-graph.
 * This file exists only so that any code that still imports `../lib/evaluate`
 * continues to resolve without change.
 *
 * @deprecated Import from '@fire-stick/story-graph' directly.
 */
import type { Flags, StoryChapter } from '@fire-stick/types';
import { evaluateWhen, selectVariant } from '@fire-stick/story-graph';

export { evaluateWhen, selectVariant };

/**
 * Walk the full chapter sequence under the given flags and return the ids of
 * chapters that would play.
 *
 * Delegates to the package's `selectVariant` — single source of truth shared
 * with the relay and the Kotlin TV app.
 */
export function simulatePath(chapters: StoryChapter[], flags: Flags): string[] {
  return chapters
    .filter((ch) => selectVariant(ch, flags) !== null)
    .map((ch) => ch.id);
}
