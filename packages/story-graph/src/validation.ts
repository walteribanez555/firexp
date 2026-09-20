/**
 * Zod schema for an EpisodeDetail / StoryGraph and a `validateEpisode` helper
 * that returns structured issues (errors and warnings).
 */

import { z } from 'zod';
import type { EpisodeDetail } from '@fire-stick/types';
import { parseWhen } from './condition.js';
import { findShadowedVariants, findInconsequentialDecisions } from './engine.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const ActionSchema = z.enum([
  'hands_up',
  'crouch',
  'lean_forward',
  'cover_eyes',
  'point_left',
  'point_right',
  'stand_up',
]);

export const FlagSetSchema = z.record(z.union([z.string(), z.number()]));

export const StoryVariantSchema = z.object({
  in:       z.number(),
  out:      z.number(),
  when:     z.string(),
  tag:      z.string().optional(),
  videoUrl: z.string().optional(),
});

export const DecisionOptionSchema = z.object({
  gesture: ActionSchema,
  label:   z.string(),
  set:     FlagSetSchema,
});

export const DecisionDefaultSchema = z.object({
  set: FlagSetSchema,
});

export const ChapterDecisionSchema = z.object({
  id:      z.string(),
  phase:   z.enum(['pre', 'during']),
  at:      z.number().optional(),
  window:  z.number(),
  prompt:  z.string().optional(),
  options: z.array(DecisionOptionSchema),
  default: DecisionDefaultSchema,
});

export const StoryChapterSchema = z.object({
  id:        z.string(),
  title:     z.string(),
  decisions: z.array(ChapterDecisionSchema),
  variants:  z.array(StoryVariantSchema).min(1, 'Chapter must have at least one variant'),
});

export const StoryGraphSchema = z.object({
  video:    z.string(),
  title:    z.string(),
  flags:    z.record(z.number()),
  chapters: z.array(StoryChapterSchema).min(1, 'Episode must have at least one chapter'),
});

export const QuestionOptionSchema = z.object({
  id:    z.string(),
  label: z.string(),
  flags: FlagSetSchema,
});

export const QuestionSchema = z.object({
  id:      z.string(),
  text:    z.string(),
  options: z.array(QuestionOptionSchema),
});

/** Full schema for an EpisodeDetail (the unit of validation). */
export const GraphSchema = StoryGraphSchema.extend({
  id:            z.string(),
  seriesId:      z.string(),
  number:        z.number(),
  questionnaire: z.array(QuestionSchema),
});

// ── Validation result ─────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code:     string;
  message:  string;
  path:     string;
  severity: IssueSeverity;
}

export interface ValidationResult {
  ok:     boolean;
  issues: ValidationIssue[];
}

// ── validateEpisode ───────────────────────────────────────────────────────────

/**
 * Validate an `EpisodeDetail` object and return structured issues.
 *
 * Errors (ok = false):
 *   - Schema violations (zod)
 *   - Invalid `when` expressions that cannot be parsed
 *   - Chapter with no `"default"` as last variant
 *   - Shadowed variants (appear after a `"default"`, never reachable)
 *
 * Warnings (ok remains true):
 *   - Inconsequential decisions (set flags that no later chapter's `when` checks)
 *   - Variants with `out <= in` (zero-duration or inverted segment)
 */
export function validateEpisode(episode: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ── 1. Schema validation ───────────────────────────────────────────────────
  const parsed = GraphSchema.safeParse(episode);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code:     'SCHEMA_VIOLATION',
        message:  issue.message,
        path:     issue.path.join('.'),
        severity: 'error',
      });
    }
    // Can't do semantic checks without a valid structure
    return { ok: false, issues };
  }

  const ep = parsed.data as EpisodeDetail;

  // ── 2. Semantic checks ────────────────────────────────────────────────────
  for (const [ci, chapter] of ep.chapters.entries()) {
    const baseChapterPath = `chapters.${ci}`;

    // 2a. Variants: parseable `when`, last must be "default", no shadowed
    for (const [vi, variant] of chapter.variants.entries()) {
      const varPath = `${baseChapterPath}.variants.${vi}`;

      // Parse check
      try {
        parseWhen(variant.when);
      } catch (err) {
        issues.push({
          code:     'INVALID_WHEN',
          message:  err instanceof Error ? err.message : `Invalid when expression: "${variant.when}"`,
          path:     `${varPath}.when`,
          severity: 'error',
        });
      }

      // Zero / inverted duration (warning)
      if (variant.out <= variant.in) {
        issues.push({
          code:     'ZERO_DURATION_VARIANT',
          message:  `Variant has out (${variant.out}) <= in (${variant.in}) — zero or inverted segment`,
          path:     varPath,
          severity: 'warning',
        });
      }
    }

    // 2b. Last variant must be "default"
    const lastVariant = chapter.variants[chapter.variants.length - 1];
    if (lastVariant && lastVariant.when.trim() !== 'default') {
      issues.push({
        code:     'MISSING_DEFAULT_VARIANT',
        message:  `Chapter "${chapter.id}" last variant must be "default" but is "${lastVariant.when}"`,
        path:     `${baseChapterPath}.variants`,
        severity: 'error',
      });
    }

    // 2c. Shadowed variants
    const shadowed = findShadowedVariants(chapter);
    for (const sv of shadowed) {
      const svIndex = chapter.variants.indexOf(sv);
      issues.push({
        code:     'SHADOWED_VARIANT',
        message:  `Variant at index ${svIndex} (when="${sv.when}") in chapter "${chapter.id}" is unreachable — a preceding "default" always matches first`,
        path:     `${baseChapterPath}.variants.${svIndex}`,
        severity: 'error',
      });
    }
  }

  // 2d. Inconsequential decisions (warning)
  const inconsequential = findInconsequentialDecisions(ep);
  for (const { chapterId, decisionId } of inconsequential) {
    const ci = ep.chapters.findIndex((c) => c.id === chapterId);
    const chapter = ep.chapters[ci];
    const di = chapter?.decisions.findIndex((d) => d.id === decisionId) ?? -1;
    issues.push({
      code:     'INCONSEQUENTIAL_DECISION',
      message:  `Decision "${decisionId}" in chapter "${chapterId}" does not affect any later chapter's variant selection (flags it sets are not referenced in any downstream "when")`,
      path:     `chapters.${ci}.decisions.${di}`,
      severity: 'warning',
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  return { ok: !hasErrors, issues };
}
