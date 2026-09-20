import { config, createLogger } from '../../config';
import { putObject } from '../../common/services/s3.service';

const logger = createLogger('CoversService');

/** Nova Canvas cover dimensions — 16:9, matches the Fire TV catalog card. */
const COVER_WIDTH = 1280;
const COVER_HEIGHT = 720;

export interface GeneratedCover {
  /** Public/CDN URL for the uploaded PNG (or a stub URL in offline mode). */
  url: string;
  /** S3 key the image was written to. */
  key: string;
  /** false when running without a bucket (stub) or when Bedrock was unavailable. */
  uploaded: boolean;
  /** true when a real Nova Canvas image was generated (vs. a skipped stub). */
  generated: boolean;
}

/**
 * Generate cover art with Amazon Nova Canvas and upload it to the content bucket.
 *
 * Uses Bedrock InvokeModel on `amazon.nova-canvas-v1:0` (TEXT_IMAGE task), reads
 * the base64 PNG from `body.images[0]`, and uploads it under `images/covers/<id>.png`.
 * Returns the CDN URL. Fails soft: if Bedrock or S3 is unavailable, it returns a
 * stub URL (uploaded/generated = false) so the CMS flow keeps working offline.
 */
export async function generateCover(opts: {
  /** Series or episode id — used for the S3 key. */
  id: string;
  /** Optional caller-supplied prompt; a default is derived from title/description. */
  prompt?: string;
  /** Human context used to build a default prompt when `prompt` is omitted. */
  title?: string;
  description?: string;
  /** Key prefix — "covers" for series, "episode-covers" for episodes. */
  kind?: 'covers' | 'episode-covers';
}): Promise<GeneratedCover> {
  const { id, kind = 'covers' } = opts;
  const key = `images/${kind}/${id}.png`;

  const prompt =
    opts.prompt?.trim() ||
    buildDefaultPrompt(opts.title, opts.description);

  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );
    const client = new BedrockRuntimeClient({ region: config.getValue('awsRegion') });

    const requestBody = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: { text: prompt },
      imageGenerationConfig: {
        width: COVER_WIDTH,
        height: COVER_HEIGHT,
        numberOfImages: 1,
        cfgScale: 8,
        seed: Math.floor(Math.random() * 858993459),
        quality: 'standard',
      },
    };

    const res = await client.send(
      new InvokeModelCommand({
        modelId: config.getValue('bedrockImageModelId'),
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      }),
    );

    const decoded = JSON.parse(new TextDecoder().decode(res.body)) as {
      images?: string[];
      error?: string;
    };

    const base64 = decoded.images?.[0];
    if (!base64) {
      throw new Error(decoded.error ?? 'Nova Canvas returned no image');
    }

    const png = Buffer.from(base64, 'base64');
    const { publicUrl, uploaded } = await putObject({
      key,
      body: png,
      contentType: 'image/png',
    });

    logger.info('Cover generated with Nova Canvas', { id, key, uploaded });
    return { url: publicUrl, key, uploaded, generated: true };
  } catch (err) {
    // Fail soft — the dashboard flow should not break when Bedrock/S3 is offline.
    logger.warn('Nova Canvas unavailable — cover not generated', {
      id,
      err: (err as Error).message,
    });
    const { buildPublicUrl } = await import('../../common/services/s3.service');
    return { url: buildPublicUrl(key), key, uploaded: false, generated: false };
  }
}

/** Compose a cinematic default prompt from the series/episode metadata. */
function buildDefaultPrompt(title?: string, description?: string): string {
  const subject = title?.trim() || 'an interactive branching story';
  const detail = description?.trim() ? ` ${description.trim()}.` : '';
  return (
    `Cinematic cover art for "${subject}".${detail} ` +
    `Dramatic lighting, high detail, poster composition, 16:9, no text.`
  );
}
