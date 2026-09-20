import { buildCacheKey } from '../prompt-cache';
import type { PromptRequest } from '../prompts.types';

// ── Cache key determinism ─────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  const baseReq: PromptRequest = {
    storyId:    'episode1',
    chapterId:  'ch1',
    decisionId: 'ch1_pre_1',
    options:    [
      { gesture: 'hands_up',  label: 'Enter' },
      { gesture: 'crouch',    label: 'Wait'  },
    ],
    flags: { confident: 2, united: 1 },
  };

  it('returns the same key for identical inputs', () => {
    expect(buildCacheKey(baseReq)).toBe(buildCacheKey({ ...baseReq }));
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    const key = buildCacheKey(baseReq);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same key regardless of flag insertion order', () => {
    const req1 = { ...baseReq, flags: { confident: 2, united: 1 } };
    const req2 = { ...baseReq, flags: { united: 1, confident: 2 } };
    expect(buildCacheKey(req1)).toBe(buildCacheKey(req2));
  });

  it('produces different keys when flags differ', () => {
    const req1 = { ...baseReq, flags: { confident: 2 } };
    const req2 = { ...baseReq, flags: { confident: 3 } };
    expect(buildCacheKey(req1)).not.toBe(buildCacheKey(req2));
  });

  it('produces different keys when decisionId differs', () => {
    const req1 = { ...baseReq, decisionId: 'ch1_pre_1' };
    const req2 = { ...baseReq, decisionId: 'ch1_pre_2' };
    expect(buildCacheKey(req1)).not.toBe(buildCacheKey(req2));
  });

  it('produces different keys when storyId differs', () => {
    const req1 = { ...baseReq, storyId: 'episode1' };
    const req2 = { ...baseReq, storyId: 'episode2' };
    expect(buildCacheKey(req1)).not.toBe(buildCacheKey(req2));
  });

  it('produces the same key regardless of options gesture order', () => {
    const req1 = { ...baseReq, options: [{ gesture: 'hands_up' as const, label: 'Enter' }, { gesture: 'crouch' as const, label: 'Wait' }] };
    const req2 = { ...baseReq, options: [{ gesture: 'crouch' as const, label: 'Wait'  }, { gesture: 'hands_up' as const, label: 'Enter' }] };
    expect(buildCacheKey(req1)).toBe(buildCacheKey(req2));
  });
});
