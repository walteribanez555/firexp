/**
 * Fixture-driven test suite for @fire-stick/story-graph.
 *
 * Each fixture file is the shared parity contract between the TypeScript
 * package and the Kotlin TV app — kept JSON so either side can load and assert
 * without a cross-language test runner.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseWhen,
  whenToString,
  evaluateWhen,
  applySet,
  selectVariant,
  resolveVotes,
  findShadowedVariants,
  findInconsequentialDecisions,
  reachableEndings,
  validateEpisode,
} from '../src/index.js';

import type {
  StoryChapter,
  DecisionOption,
  EpisodeDetail,
  Flags,
  FlagSet,
} from '@fire-stick/types';

// ── fixture loader ─────────────────────────────────────────────────────────────

function loadFixture<T>(name: string): T {
  const path = join(__dirname, '..', 'fixtures', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

// ── evaluateWhen ──────────────────────────────────────────────────────────────

interface EvaluateWhenFixture {
  description: string;
  when:        string;
  flags:       Flags;
  expected:    boolean;
}

describe('evaluateWhen', () => {
  const fixtures = loadFixture<EvaluateWhenFixture[]>('evaluate-when');

  for (const fx of fixtures) {
    it(fx.description, () => {
      expect(evaluateWhen(fx.when, fx.flags)).toBe(fx.expected);
    });
  }

  it('accepts a pre-parsed Cond AST directly', () => {
    const cond = parseWhen('confident <= -2 && united >= 1');
    expect(evaluateWhen(cond, { confident: -3, united: 2 })).toBe(true);
    expect(evaluateWhen(cond, { confident: -3, united: 0 })).toBe(false);
  });

  it('accepts a bare Clause object', () => {
    expect(evaluateWhen({ flag: 'confident', op: 'gte', value: 1 }, { confident: 1 })).toBe(true);
    expect(evaluateWhen({ flag: 'confident', op: 'gte', value: 1 }, { confident: 0 })).toBe(false);
  });

  it('accepts an { any: [...] } Cond', () => {
    const cond = { any: [
      { flag: 'a', op: 'gte' as const, value: 1 },
      { flag: 'b', op: 'gte' as const, value: 1 },
    ] };
    expect(evaluateWhen(cond, { a: 0, b: 1 })).toBe(true);
    expect(evaluateWhen(cond, { a: 0, b: 0 })).toBe(false);
  });

  it('throws on invalid legacy string clause', () => {
    expect(() => evaluateWhen('NOT VALID!!', {})).toThrow();
  });
});

// ── parseWhen / whenToString ──────────────────────────────────────────────────

describe('parseWhen / whenToString', () => {
  it('round-trips "default"', () => {
    const cond = parseWhen('default');
    expect(cond).toBe('default');
    expect(whenToString(cond)).toBe('default');
  });

  it('round-trips a single clause', () => {
    const expr = 'confident <= -2';
    expect(whenToString(parseWhen(expr))).toBe(expr);
  });

  it('round-trips a compound && clause', () => {
    const expr = 'confident <= -2 && united >= 1';
    expect(whenToString(parseWhen(expr))).toBe(expr);
  });

  it('produces { all: [...] } for compound &&', () => {
    const cond = parseWhen('confident <= -2 && united >= 1');
    expect(cond).toEqual({
      all: [
        { flag: 'confident', op: 'lte', value: -2 },
        { flag: 'united',    op: 'gte', value: 1  },
      ],
    });
  });

  it('produces a bare Clause for a single clause', () => {
    const cond = parseWhen('confident >= 1');
    expect(cond).toEqual({ flag: 'confident', op: 'gte', value: 1 });
  });

  it('supports negative values', () => {
    const cond = parseWhen('confident <= -2');
    expect(cond).toEqual({ flag: 'confident', op: 'lte', value: -2 });
  });

  it('supports all operators', () => {
    expect(parseWhen('x >= 0')).toMatchObject({ op: 'gte' });
    expect(parseWhen('x <= 0')).toMatchObject({ op: 'lte' });
    expect(parseWhen('x > 0')).toMatchObject({ op: 'gt' });
    expect(parseWhen('x < 0')).toMatchObject({ op: 'lt' });
    expect(parseWhen('x == 0')).toMatchObject({ op: 'eq' });
    expect(parseWhen('x != 0')).toMatchObject({ op: 'ne' });
  });

  it('throws on malformed expression', () => {
    expect(() => parseWhen('confident ??? 1')).toThrow();
  });

  it('whenToString serialises { any: [...] } with ||', () => {
    const cond = { any: [
      { flag: 'a', op: 'gte' as const, value: 1 },
      { flag: 'b', op: 'gte' as const, value: 2 },
    ] };
    expect(whenToString(cond)).toBe('a >= 1 || b >= 2');
  });
});

// ── applySet ──────────────────────────────────────────────────────────────────

interface ApplySetFixture {
  description: string;
  flags:       Flags;
  set:         FlagSet;
  expected:    Flags;
}

describe('applySet', () => {
  const fixtures = loadFixture<ApplySetFixture[]>('apply-set');

  for (const fx of fixtures) {
    it(fx.description, () => {
      const result = applySet(fx.flags, fx.set);
      expect(result).toEqual(fx.expected);
    });
  }

  it('does not mutate the input flags object', () => {
    const original: Flags = { confident: 1 };
    applySet(original, { confident: '+5' });
    expect(original.confident).toBe(1);
  });
});

// ── selectVariant ─────────────────────────────────────────────────────────────

interface SelectVariantFixture {
  description: string;
  chapter:     StoryChapter;
  flags:       Flags;
  expectedTag: string | null;
}

describe('selectVariant', () => {
  const fixtures = loadFixture<SelectVariantFixture[]>('select-variant');

  for (const fx of fixtures) {
    it(fx.description, () => {
      const variant = selectVariant(fx.chapter, fx.flags);
      if (fx.expectedTag === null) {
        expect(variant).toBeNull();
      } else {
        expect(variant).not.toBeNull();
        expect(variant!.tag).toBe(fx.expectedTag);
      }
    });
  }
});

// ── resolveVotes ──────────────────────────────────────────────────────────────

interface ResolveVotesFixture {
  description: string;
  votes:       Record<string, string>;
  options:     DecisionOption[];
  expected:    string;
}

describe('resolveVotes', () => {
  const fixtures = loadFixture<ResolveVotesFixture[]>('resolve-votes');

  for (const fx of fixtures) {
    it(fx.description, () => {
      expect(resolveVotes(fx.votes, fx.options)).toBe(fx.expected);
    });
  }
});

// ── findShadowedVariants ──────────────────────────────────────────────────────

interface ShadowedFixture {
  description:          string;
  chapter:              StoryChapter;
  expectedShadowedCount: number;
  expectedShadowedTags?: string[];
}

describe('findShadowedVariants', () => {
  const fixtures = loadFixture<ShadowedFixture[]>('shadowed-variants');

  for (const fx of fixtures) {
    it(fx.description, () => {
      const shadowed = findShadowedVariants(fx.chapter);
      expect(shadowed).toHaveLength(fx.expectedShadowedCount);
      if (fx.expectedShadowedTags) {
        const tags = shadowed.map((v) => v.tag ?? v.when);
        expect(tags).toEqual(fx.expectedShadowedTags);
      }
    });
  }
});

// ── reachableEndings ──────────────────────────────────────────────────────────

interface FullEpisodeFixture {
  description:              string;
  episode:                  EpisodeDetail;
  expectedReachableEndings: string[];
}

describe('reachableEndings', () => {
  const fx = loadFixture<FullEpisodeFixture>('full-episode');

  it(fx.description, () => {
    const endings = reachableEndings(fx.episode);
    expect(endings.sort()).toEqual(fx.expectedReachableEndings.sort());
  });

  it('returns only "alone" when episode has single chapter with no decisions', () => {
    const episode: EpisodeDetail = {
      id: 'ep-test', seriesId: 's1', number: 1,
      video: '', title: 'Test', flags: {}, questionnaire: [],
      chapters: [
        {
          id: 'ch1', title: 'Ch', decisions: [],
          variants: [{ in: 0, out: 10, when: 'united >= 1', tag: 'together' }, { in: 10, out: 20, when: 'default', tag: 'alone' }],
        },
      ],
    };
    expect(reachableEndings(episode)).toContain('alone');
    // united starts at 0, never set → only 'alone' reachable
    expect(reachableEndings(episode)).not.toContain('together');
  });
});

// ── findInconsequentialDecisions ──────────────────────────────────────────────

describe('findInconsequentialDecisions', () => {
  it('reports decision whose flags are never referenced in later chapters', () => {
    const episode: EpisodeDetail = {
      id: 'ep1', seriesId: 's1', number: 1,
      video: '', title: 'T', flags: {}, questionnaire: [],
      chapters: [
        {
          id: 'ch1', title: 'Ch1',
          decisions: [
            {
              id: 'dec1', phase: 'pre', window: 5000,
              options: [{ gesture: 'hands_up', label: 'A', set: { brave: '+1' } }],
              default: { set: {} },
            },
          ],
          variants: [{ in: 0, out: 10, when: 'default', tag: 'n' }],
        },
        {
          id: 'ch2', title: 'Ch2',
          decisions: [],
          // 'brave' is never referenced here
          variants: [{ in: 0, out: 10, when: 'default', tag: 'end' }],
        },
      ],
    };
    const result = findInconsequentialDecisions(episode);
    expect(result).toContainEqual({ chapterId: 'ch1', decisionId: 'dec1' });
  });

  it('does not report consequential decision', () => {
    const episode: EpisodeDetail = {
      id: 'ep2', seriesId: 's1', number: 2,
      video: '', title: 'T', flags: {}, questionnaire: [],
      chapters: [
        {
          id: 'ch1', title: 'Ch1',
          decisions: [
            {
              id: 'dec1', phase: 'pre', window: 5000,
              options: [{ gesture: 'hands_up', label: 'A', set: { brave: '+1' } }],
              default: { set: {} },
            },
          ],
          variants: [{ in: 0, out: 10, when: 'default', tag: 'n' }],
        },
        {
          id: 'ch2', title: 'Ch2',
          decisions: [],
          // 'brave' IS referenced here
          variants: [
            { in: 0,  out: 10, when: 'brave >= 1', tag: 'hero' },
            { in: 10, out: 20, when: 'default',    tag: 'normal' },
          ],
        },
      ],
    };
    const result = findInconsequentialDecisions(episode);
    expect(result).not.toContainEqual({ chapterId: 'ch1', decisionId: 'dec1' });
  });

  it('flags in last chapter decisions are always inconsequential (no later chapters)', () => {
    const episode: EpisodeDetail = {
      id: 'ep3', seriesId: 's1', number: 3,
      video: '', title: 'T', flags: {}, questionnaire: [],
      chapters: [
        {
          id: 'ch1', title: 'Ch1',
          decisions: [
            {
              id: 'dec1', phase: 'during', window: 5000,
              options: [{ gesture: 'hands_up', label: 'A', set: { brave: '+1' } }],
              default: { set: {} },
            },
          ],
          variants: [{ in: 0, out: 10, when: 'default', tag: 'end' }],
        },
      ],
    };
    const result = findInconsequentialDecisions(episode);
    expect(result).toContainEqual({ chapterId: 'ch1', decisionId: 'dec1' });
  });
});

// ── validateEpisode ───────────────────────────────────────────────────────────

interface ValidationFixture {
  description:       string;
  episode:           unknown;
  expectedOk:        boolean;
  expectedErrorCodes?: string[];
  expectedWarnCodes?:  string[];
}

describe('validateEpisode', () => {
  const fixtures = loadFixture<ValidationFixture[]>('validation');

  for (const fx of fixtures) {
    it(fx.description, () => {
      const result = validateEpisode(fx.episode);
      expect(result.ok).toBe(fx.expectedOk);

      if (fx.expectedErrorCodes?.length) {
        const errorCodes = result.issues.filter((i) => i.severity === 'error').map((i) => i.code);
        for (const code of fx.expectedErrorCodes) {
          expect(errorCodes).toContain(code);
        }
      }

      if (fx.expectedWarnCodes?.length) {
        const warnCodes = result.issues.filter((i) => i.severity === 'warning').map((i) => i.code);
        for (const code of fx.expectedWarnCodes) {
          expect(warnCodes).toContain(code);
        }
      }
    });
  }

  it('reports SCHEMA_VIOLATION for structurally invalid input', () => {
    const result = validateEpisode({ not: 'an episode' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'SCHEMA_VIOLATION')).toBe(true);
  });

  it('warns about ZERO_DURATION_VARIANT when out <= in', () => {
    const episode = {
      id: 'ep-zero', seriesId: 's1', number: 1,
      video: '', title: 'T', flags: {}, questionnaire: [],
      chapters: [
        {
          id: 'ch1', title: 'Ch1', decisions: [],
          variants: [{ in: 10, out: 5, when: 'default', tag: 'bad' }],
        },
      ],
    };
    const result = validateEpisode(episode);
    expect(result.issues.some((i) => i.code === 'ZERO_DURATION_VARIANT')).toBe(true);
  });
});
