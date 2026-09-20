import { Hono } from 'hono';
import { promptsService } from './prompts.service';
import { BadRequestException, handleException } from '../../common/exceptions';
import type { AppEnv } from '../../app.types';
import type { PromptRequest } from './prompts.types';
import type { Action } from '@fire-stick/types';

export const promptsRouter = new Hono<AppEnv>();

/**
 * POST /api/v1/prompts/generate
 *
 * Called by the fire-tv engine just before opening a decision window.
 * Returns an AI-generated (or random) prompt that replaces the static one
 * from story.json.
 *
 * Body:
 * {
 *   decisionId:  string
 *   chapterId:   string
 *   storyId:     string         // matches a file in /kb/<storyId>.json
 *   options:     { gesture, label }[]
 *   flags:       Record<string, number>
 *   staticPrompt?: string       // fallback if KB/AI unavailable
 * }
 */
promptsRouter.post('/generate', async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as (PromptRequest & { staticPrompt?: string }) | null;

    if (!body?.decisionId || !body.chapterId || !body.storyId || !Array.isArray(body.options)) {
      throw new BadRequestException('Missing required fields: decisionId, chapterId, storyId, options');
    }

    const result = await promptsService.generate(
      {
        decisionId: body.decisionId,
        chapterId:  body.chapterId,
        storyId:    body.storyId,
        options:    body.options as { gesture: Action; label: string }[],
        flags:      body.flags ?? {},
      },
      body.staticPrompt,
    );

    return c.json({ data: result });
  } catch (err) {
    return handleException(err, c);
  }
});
