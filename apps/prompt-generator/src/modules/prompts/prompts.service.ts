import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ConverseCommand, type Tool } from '@aws-sdk/client-bedrock-runtime';
import type { Action, Flags } from '@fire-stick/types';
import { bedrockClient, getModelId, getPromptMode } from './prompts.config';
import { buildCacheKey, promptCache } from './prompt-cache';
import type {
  GeneratedPrompt, KnowledgeBase, KbDecision, PromptRequest, PromptTone,
} from './prompts.types';
import { createLogger } from '../../config';

const logger = createLogger('PromptsService');

// ── Knowledge base cache ──────────────────────────────────────────────────────

const kbCache = new Map<string, KnowledgeBase>();

function loadKB(storyId: string): KnowledgeBase | null {
  if (kbCache.has(storyId)) return kbCache.get(storyId)!;

  const path = join(process.cwd(), 'kb', `${storyId}.json`);
  if (!existsSync(path)) {
    logger.warn(`KB not found for story: ${storyId}`);
    return null;
  }

  try {
    const kb = JSON.parse(readFileSync(path, 'utf8')) as KnowledgeBase;
    kbCache.set(storyId, kb);
    return kb;
  } catch (err) {
    logger.error(`Failed to parse KB for story: ${storyId}`, err);
    return null;
  }
}

// ── Bedrock tool definition ───────────────────────────────────────────────────

const PROMPT_TOOL: Tool = {
  toolSpec: {
    name:        'generate_prompt',
    description: 'Generate a narrative decision prompt for an interactive film experience.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          prompt: {
            type:        'string',
            description: 'The situation or question shown to viewers. Max 15 words. Written as story narration, not as a game instruction. Never say "choose", "vote", "gesture", or "decide".',
          },
          tone: {
            type:        'string',
            enum:        ['tense', 'hopeful', 'urgent', 'mysterious', 'neutral'],
            description: 'The emotional tone that best fits this prompt.',
          },
          nudgeTarget: {
            type:        ['string', 'null'],
            enum:        ['hands_up', 'crouch', 'lean_forward', 'cover_eyes', 'point_left', 'point_right', 'stand_up', null],
            description: 'The gesture this prompt subtly favors through framing. Null if genuinely neutral.',
          },
        },
        required: ['prompt', 'tone', 'nudgeTarget'],
      },
    },
  },
};

// ── Desired direction helper ──────────────────────────────────────────────────

function computeDesiredOption(
  kbDecision: KbDecision,
  options: { gesture: Action; label: string }[],
  _flags: Flags,
): { target: Action | null; key: string } {
  const target = kbDecision.nudgeTarget;
  if (!target) return { target: null, key: 'neutral' };

  const optionExists = options.some((o) => o.gesture === target);
  if (!optionExists) return { target: null, key: 'neutral' };

  const key = `toward_${target}` as keyof typeof kbDecision.promptTemplates;
  return { target, key };
}

// ── Random mode ───────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandom(
  kbDecision: KbDecision,
  options: { gesture: Action; label: string }[],
  flags: Flags,
  staticPrompt?: string,
): GeneratedPrompt {
  const { target, key } = computeDesiredOption(kbDecision, options, flags);
  const pool = kbDecision.promptTemplates[key as keyof typeof kbDecision.promptTemplates]
    ?? kbDecision.promptTemplates.neutral;

  const prompt = pool.length > 0 ? pickRandom(pool) : (staticPrompt ?? 'What do you do?');

  return {
    prompt,
    tone:        target ? 'tense' : 'neutral',
    nudgeTarget: target,
    source:      'random',
  };
}

// ── AI mode ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(kb: KnowledgeBase, chapterId: string, kbDecision: KbDecision): string {
  const chapter = kb.chapters[chapterId];
  const { nudgeTarget: target } = kbDecision;
  const desiredFlag = target
    ? `The story benefits when the audience ${target === 'hands_up' ? 'acts boldly (hands_up)' : target === 'crouch' ? 'holds back (crouch)' : `chooses ${target}`}.`
    : 'The story works well with any choice here.';

  return `You are a narrative director for an interactive film.

STORY: ${kb.narrativeContext}

CURRENT CHAPTER: "${chapterId}"
SETTING: ${chapter?.setting ?? 'unknown'}
CHARACTER MOOD: ${chapter?.characterMood ?? 'neutral'}
TENSION LEVEL: ${chapter?.tensionLevel ?? 5}/10

NARRATIVE NOTE: ${desiredFlag} Do not state this explicitly — achieve it through framing.

Rules:
- Write from inside the story (narrator's voice), never break the fourth wall
- Max 15 words
- Never use: "choose", "pick", "vote", "gesture", "react", "decide", "audience"
- Make the emotionally resonant option feel natural, not forced
- The prompt should read like a line from a thriller screenplay`;
}

function buildUserMessage(
  options: { gesture: Action; label: string }[],
  flags: Flags,
): string {
  return `Current audience state: ${JSON.stringify(flags)}

Available options for this decision:
${options.map((o) => `- ${o.gesture}: "${o.label}"`).join('\n')}

Generate the narrative prompt using the generate_prompt tool.`;
}

async function generateWithAI(
  kb: KnowledgeBase,
  chapterId: string,
  kbDecision: KbDecision,
  options: { gesture: Action; label: string }[],
  flags: Flags,
): Promise<GeneratedPrompt> {
  const systemPrompt = buildSystemPrompt(kb, chapterId, kbDecision);
  const userMessage  = buildUserMessage(options, flags);

  const response = await bedrockClient.send(new ConverseCommand({
    modelId:  getModelId(),
    system:   [{ text: systemPrompt }],
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    toolConfig: {
      tools:      [PROMPT_TOOL],
      toolChoice: { tool: { name: 'generate_prompt' } },
    },
    inferenceConfig: {
      maxTokens:   256,
      temperature: 0.8,
    },
  }));

  const toolBlock = response.output?.message?.content?.find(
    (b) => b.toolUse?.name === 'generate_prompt',
  );

  if (!toolBlock?.toolUse?.input) {
    throw new Error(`Bedrock did not return generate_prompt block (stopReason: ${response.stopReason})`);
  }

  const result = toolBlock.toolUse.input as {
    prompt:      string;
    tone:        PromptTone;
    nudgeTarget: Action | null;
  };

  logger.info('AI prompt generated', {
    prompt:      result.prompt,
    nudgeTarget: result.nudgeTarget,
    tone:        result.tone,
  });

  return { ...result, source: 'ai' };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const promptsService = {
  async generate(req: PromptRequest, staticPrompt?: string): Promise<GeneratedPrompt> {
    const kb = loadKB(req.storyId);

    // If no KB or mode is static → return static prompt as-is
    if (!kb || getPromptMode() === 'static') {
      return {
        prompt:      staticPrompt ?? 'What do you do?',
        tone:        'neutral',
        nudgeTarget: null,
        source:      'static',
      };
    }

    const kbChapter  = kb.chapters[req.chapterId];
    const kbDecision = kbChapter?.decisions[req.decisionId];

    if (!kbDecision) {
      logger.warn(`No KB entry for decision ${req.decisionId} in chapter ${req.chapterId}`);
      return {
        prompt:      staticPrompt ?? 'What do you do?',
        tone:        'neutral',
        nudgeTarget: null,
        source:      'static',
      };
    }

    if (getPromptMode() === 'random') {
      const result = generateRandom(kbDecision, req.options, req.flags, staticPrompt);
      // write-through cache for random results too
      void promptCache.put(buildCacheKey(req), result);
      return result;
    }

    // AI mode — check cache first
    const cacheKey = buildCacheKey(req);
    const cached   = await promptCache.get(cacheKey);
    if (cached) {
      logger.info('Returning cached prompt', { cacheKey });
      return cached;
    }

    // Call Bedrock with fallback to random on error
    try {
      const result = await generateWithAI(kb, req.chapterId, kbDecision, req.options, req.flags);
      void promptCache.put(cacheKey, result);
      return result;
    } catch (err) {
      logger.error('Bedrock call failed, falling back to random', err);
      const fallback = generateRandom(kbDecision, req.options, req.flags, staticPrompt);
      void promptCache.put(cacheKey, fallback);
      return fallback;
    }
  },
};
