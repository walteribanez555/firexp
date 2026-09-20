/**
 * Unit tests for the prompts service.
 *
 * Mocks:
 *  - @aws-sdk/client-bedrock-runtime  → prevents live Bedrock calls
 *  - @aws-sdk/lib-dynamodb            → prevents live DynamoDB calls
 *  - node:fs (existsSync / readFileSync) → serves a fake KB
 */

// ── Mock AWS SDK clients before any imports ───────────────────────────────────

jest.mock('@aws-sdk/client-bedrock-runtime', () => {
  const mockSend = jest.fn();
  return {
    BedrockRuntimeClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    ConverseCommand:      jest.fn().mockImplementation((input: unknown) => input),
    __mockSend:           mockSend,
  };
});

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const mockSend = jest.fn().mockResolvedValue({ Item: null });
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue({ send: mockSend }),
    },
    GetCommand: jest.fn().mockImplementation((input: unknown) => input),
    PutCommand: jest.fn().mockImplementation((input: unknown) => input),
    __mockSend: mockSend,
  };
});

// ── Mock fs to serve a synthetic knowledge base ───────────────────────────────

const FAKE_KB = {
  storyId:          'episode1',
  title:            'Test Episode',
  narrativeContext: 'A test story.',
  desiredArc:       { targetEnding: 'heroic', tensionCurve: [3, 6, 9], flagTargets: {} },
  chapters: {
    ch1: {
      tensionLevel:  3,
      characterMood: 'curious',
      setting:       'dusk',
      decisions: {
        ch1_pre_1: {
          nudgeTarget:   'hands_up',
          nudgeStrength: 0.6,
          promptTemplates: {
            toward_hands_up: ['A flicker of light inside.', 'Someone might need help.'],
            neutral:          ['The door is open.'],
          },
        },
      },
    },
  },
};

jest.mock('node:fs', () => ({
  existsSync:   jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(JSON.stringify(FAKE_KB)),
}));

// ── Shared test data ──────────────────────────────────────────────────────────

const BASE_REQ = {
  storyId:    'episode1',
  chapterId:  'ch1',
  decisionId: 'ch1_pre_1',
  options:    [
    { gesture: 'hands_up' as const, label: 'Enter' },
    { gesture: 'crouch'   as const, label: 'Wait'  },
  ],
  flags: {},
};

// Helper types for mock modules
interface MockBedrockModule {
  __mockSend: jest.Mock;
  BedrockRuntimeClient: jest.Mock;
  ConverseCommand: jest.Mock;
}
interface MockDynamoModule {
  __mockSend: jest.Mock;
  DynamoDBDocumentClient: { from: jest.Mock };
  GetCommand: jest.Mock;
  PutCommand: jest.Mock;
}
interface MockPromptsModule {
  promptsService: {
    generate(req: typeof BASE_REQ, staticPrompt?: string): Promise<{
      prompt: string;
      tone: string;
      nudgeTarget: string | null;
      source: string;
    }>;
  };
}

// ── Tests: random mode ────────────────────────────────────────────────────────

describe('promptsService.generate — random mode', () => {
  beforeEach(() => {
    process.env['PROMPT_MODE'] = 'random';
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env['PROMPT_MODE'];
  });

  it('returns a prompt from KB templates and NEVER calls Bedrock', async () => {
    jest.mock('@aws-sdk/client-bedrock-runtime', () => {
      const mockSend = jest.fn();
      return {
        BedrockRuntimeClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
        ConverseCommand:      jest.fn().mockImplementation((input: unknown) => input),
        __mockSend:           mockSend,
      };
    });
    jest.mock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn().mockImplementation(() => ({})),
    }));
    jest.mock('@aws-sdk/lib-dynamodb', () => {
      const mockSend = jest.fn().mockResolvedValue({ Item: null });
      return {
        DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
        GetCommand: jest.fn().mockImplementation((input: unknown) => input),
        PutCommand: jest.fn().mockImplementation((input: unknown) => input),
        __mockSend: mockSend,
      };
    });
    jest.mock('node:fs', () => ({
      existsSync:   jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify(FAKE_KB)),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { promptsService: svc } = require('../prompts.service') as MockPromptsModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshBedrock = require('@aws-sdk/client-bedrock-runtime') as MockBedrockModule;

    const result = await svc.generate(BASE_REQ);

    expect(result.source).toBe('random');
    expect(typeof result.prompt).toBe('string');
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(freshBedrock.__mockSend).not.toHaveBeenCalled();
  });
});

// ── Tests: cache hit path ─────────────────────────────────────────────────────

describe('promptsService.generate — cache hit path', () => {
  beforeEach(() => {
    process.env['PROMPT_MODE'] = 'ai';
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env['PROMPT_MODE'];
  });

  it('returns cached prompt without calling Bedrock', async () => {
    const cachedPrompt = {
      prompt:      'A flicker of light inside.',
      tone:        'tense',
      nudgeTarget: 'hands_up',
      source:      'ai',
    };

    jest.mock('@aws-sdk/client-bedrock-runtime', () => {
      const mockSend = jest.fn();
      return {
        BedrockRuntimeClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
        ConverseCommand:      jest.fn().mockImplementation((input: unknown) => input),
        __mockSend:           mockSend,
      };
    });
    jest.mock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn().mockImplementation(() => ({})),
    }));
    jest.mock('@aws-sdk/lib-dynamodb', () => {
      const mockSend = jest.fn().mockResolvedValue({
        Item: {
          cacheKey: 'somekey',
          prompt:   cachedPrompt,
          ttl:      Math.floor(Date.now() / 1000) + 3600,
        },
      });
      return {
        DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockSend }) },
        GetCommand: jest.fn().mockImplementation((input: unknown) => input),
        PutCommand: jest.fn().mockImplementation((input: unknown) => input),
        __mockSend: mockSend,
      };
    });
    jest.mock('node:fs', () => ({
      existsSync:   jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify(FAKE_KB)),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { promptsService: svc } = require('../prompts.service') as MockPromptsModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshBedrock = require('@aws-sdk/client-bedrock-runtime') as MockBedrockModule;
    // Reference freshDynamo to show it's intentionally used via the mock
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const _freshDynamo = require('@aws-sdk/lib-dynamodb') as MockDynamoModule;
    void _freshDynamo; // suppress unused warning — mock is verified via result

    const result = await svc.generate(BASE_REQ);

    expect(result).toEqual(cachedPrompt);
    expect(freshBedrock.__mockSend).not.toHaveBeenCalled();
  });
});
