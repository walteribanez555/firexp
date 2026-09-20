/**
 * Canonical seed content for content-api.
 *
 * This is the single source of truth for dev/test seed data.
 * - Series memory repository imports SEED_SERIES for in-memory mode (tests).
 * - Episode memory repository imports SEED_EPISODES for in-memory mode (tests).
 * - dynamo-init.ts imports both to seed DynamoDB Local (local dev).
 *
 * Video/image URLs are relay-relative (/videos/..., /images/...).
 * Each client resolves them against its own relay host.
 */

import type { SeriesSummary, EpisodeDetail } from '@fire-stick/types';

// ── Series ────────────────────────────────────────────────────────────────────

export const SEED_SERIES: SeriesSummary[] = [
  {
    id:           'series1',
    title:        'Mystery House',
    description:  'A collection of interactive horror experiences where your choices change everything.',
    thumbnailUrl: '/images/series1.jpg',
    episodes: [
      { id: 'episode1', number: 1, title: 'The House at the End of the Road', thumbnailUrl: '/images/episode1.jpg' },
      { id: 'episode2', number: 2, title: 'The Cellar Below',                 thumbnailUrl: '/images/episode2.jpg' },
    ],
  },
  {
    id:           'series2',
    title:        'Deep Signal',
    description:  'A sci-fi thriller about first contact aboard a failing deep-space relay.',
    thumbnailUrl: '/images/series2.jpg',
    episodes: [
      { id: 'deep1', number: 1, title: 'Transmission', thumbnailUrl: '/images/deep1.jpg' },
    ],
  },
  {
    id:           'series3',
    title:        'Night Shift',
    description:  'The hospital empties at 3 a.m. — but you are not alone on the ward.',
    thumbnailUrl: '/images/series3.jpg',
    episodes: [
      { id: 'night1', number: 1, title: 'Rounds', thumbnailUrl: '/images/night1.jpg' },
    ],
  },
];

// ── Episodes ──────────────────────────────────────────────────────────────────

export const SEED_EPISODES: EpisodeDetail[] = [
  // ── Mystery House · Episode 1 ─────────────────────────────────────────────
  {
    id:       'episode1',
    seriesId: 'series1',
    number:   1,
    video:    '',
    title:    'The House at the End of the Road',
    questionnaire: [
      {
        id:   'q1',
        text: 'How does your character react to the unknown?',
        options: [
          { id: 'bold',    label: 'Face it head-on',   flags: { confident: '+1' } },
          { id: 'careful', label: 'Proceed carefully', flags: { confident: '-1' } },
        ],
      },
      {
        id:   'q2',
        text: 'What matters most when things go wrong?',
        options: [
          { id: 'together', label: 'Staying together',      flags: { united: '+1' } },
          { id: 'survive',  label: 'Surviving at any cost', flags: { united: '-1', violent: '+1' } },
        ],
      },
    ],
    flags: { violent: 0, confident: 0, united: 0 },
    chapters: [
      {
        id:    'ch1',
        title: 'The Arrival',
        decisions: [
          {
            id:     'ch1_pre_1',
            phase:  'pre',
            window: 6000,
            prompt: 'You see the door is open. What do you do?',
            options: [
              { gesture: 'hands_up', label: 'Go in', set: { violent: '+1', confident: '+1' } },
              { gesture: 'crouch',   label: 'Wait',  set: { confident: '-1' } },
            ],
            default: { set: { confident: '-1' } },
          },
        ],
        variants: [
          { in: 0.0, out: 12.0, when: 'violent >= 1', tag: 'confrontation', videoUrl: '/videos/ch1_confrontation.mp4' },
          { in: 0.0, out: 12.0, when: 'default',      tag: 'cautious',      videoUrl: '/videos/ch1_cautious.mp4' },
        ],
      },
      {
        id:    'ch2',
        title: 'The Basement',
        decisions: [
          {
            id:     'ch2_pre_1',
            phase:  'pre',
            window: 6000,
            prompt: 'There is a noise below. Do you go down?',
            options: [
              { gesture: 'hands_up',     label: 'Go down',  set: { confident: '+1' } },
              { gesture: 'lean_forward', label: 'Stay put', set: { united: '+1' } },
            ],
            default: { set: {} },
          },
          {
            id:     'ch2_during_1',
            phase:  'during',
            at:     6.0,
            window: 5000,
            prompt: 'You hear footsteps. Stay together?',
            options: [
              { gesture: 'hands_up', label: 'Together', set: { united: '+1' } },
              { gesture: 'crouch',   label: 'Split up', set: { united: '-1' } },
            ],
            default: { set: {} },
          },
        ],
        variants: [
          { in: 0.0, out: 12.0, when: 'confident >= 1 && violent >= 1', tag: 'bold',    videoUrl: '/videos/ch2_bold.mp4' },
          { in: 0.0, out: 12.0, when: 'united >= 1',                    tag: 'cautious', videoUrl: '/videos/ch2_cautious.mp4' },
          { in: 0.0, out: 12.0, when: 'default',                        tag: 'neutral',  videoUrl: '/videos/ch2_neutral.mp4' },
        ],
      },
      {
        id:    'ch3',
        title: 'The Exit',
        decisions: [],
        variants: [
          { in: 0.0, out: 12.0, when: 'violent >= 2 && united >= 1', tag: 'ending_heroic',  videoUrl: '/videos/ch3_ending_heroic.mp4' },
          { in: 0.0, out: 12.0, when: 'confident <= -2',             tag: 'ending_dark',    videoUrl: '/videos/ch3_ending_dark.mp4' },
          { in: 0.0, out: 12.0, when: 'default',                     tag: 'ending_neutral', videoUrl: '/videos/ch3_ending_neutral.mp4' },
        ],
      },
    ],
  },

  // ── Mystery House · Episode 2 ─────────────────────────────────────────────
  {
    id:       'episode2',
    seriesId: 'series1',
    number:   2,
    video:    '',
    title:    'The Cellar Below',
    questionnaire: [
      {
        id:   'q1',
        text: 'Do you trust the silence?',
        options: [
          { id: 'yes', label: 'Trust it',     flags: { trust: '+1' } },
          { id: 'no',  label: 'Stay on edge', flags: { fear: '+1' } },
        ],
      },
      {
        id:   'q2',
        text: 'A cold draft rises. You…',
        options: [
          { id: 'follow', label: 'Follow it', flags: { fear: '+1' } },
          { id: 'ignore', label: 'Ignore it', flags: { trust: '+1' } },
        ],
      },
    ],
    flags: { fear: 0, trust: 0 },
    chapters: [
      {
        id:    'ch1',
        title: 'Descent',
        decisions: [
          {
            id:     'ch1_pre_1',
            phase:  'pre',
            window: 6000,
            prompt: 'The stairs creak. Keep going?',
            options: [
              { gesture: 'hands_up', label: 'Descend',      set: { fear: '+1' } },
              { gesture: 'crouch',   label: 'Listen first', set: { trust: '+1' } },
            ],
            default: { set: {} },
          },
        ],
        variants: [
          { in: 0.0, out: 12.0, when: 'fear >= 1', tag: 'tense', videoUrl: '/videos/ch1_confrontation.mp4' },
          { in: 0.0, out: 12.0, when: 'default',   tag: 'calm',  videoUrl: '/videos/ch1_cautious.mp4' },
        ],
      },
      {
        id:    'ch2',
        title: 'The Door',
        decisions: [
          {
            id:     'ch2_during_1',
            phase:  'during',
            at:     5.0,
            window: 5000,
            prompt: 'Something moves behind the door.',
            options: [
              { gesture: 'point_left',  label: 'Open it',   set: { fear: '+1' } },
              { gesture: 'point_right', label: 'Back away', set: { trust: '+1' } },
            ],
            default: { set: {} },
          },
        ],
        variants: [
          { in: 0.0, out: 12.0, when: 'fear >= 2', tag: 'ending_trapped', videoUrl: '/videos/ch3_ending_dark.mp4' },
          { in: 0.0, out: 12.0, when: 'default',   tag: 'ending_escape',  videoUrl: '/videos/ch3_ending_neutral.mp4' },
        ],
      },
    ],
  },

  // ── Deep Signal · Episode 1 ───────────────────────────────────────────────
  {
    id:       'deep1',
    seriesId: 'series2',
    number:   1,
    video:    '',
    title:    'Transmission',
    questionnaire: [
      {
        id:   'q1',
        text: 'First contact protocol?',
        options: [
          { id: 'open', label: 'Respond', flags: { signal: '+1' } },
          { id: 'wait', label: 'Observe', flags: { calm: '+1' } },
        ],
      },
      {
        id:   'q2',
        text: 'The crew is uneasy. You…',
        options: [
          { id: 'reassure', label: 'Reassure them', flags: { calm: '+1' } },
          { id: 'push',     label: 'Push forward',  flags: { signal: '+1' } },
        ],
      },
    ],
    flags: { signal: 0, calm: 0 },
    chapters: [
      {
        id:    'ch1',
        title: 'The Signal',
        decisions: [
          {
            id:     'ch1_pre_1',
            phase:  'pre',
            window: 6000,
            prompt: 'A pattern repeats. Amplify it?',
            options: [
              { gesture: 'hands_up', label: 'Amplify', set: { signal: '+1' } },
              { gesture: 'crouch',   label: 'Isolate', set: { calm: '+1' } },
            ],
            default: { set: {} },
          },
        ],
        variants: [
          { in: 0.0, out: 12.0, when: 'signal >= 1', tag: 'contact', videoUrl: '/videos/ch2_bold.mp4' },
          { in: 0.0, out: 12.0, when: 'default',     tag: 'silence', videoUrl: '/videos/ch2_neutral.mp4' },
        ],
      },
      {
        id:    'ch2',
        title: 'The Response',
        decisions: [],
        variants: [
          { in: 0.0, out: 12.0, when: 'signal >= 2', tag: 'ending_contact', videoUrl: '/videos/ch3_ending_heroic.mp4' },
          { in: 0.0, out: 12.0, when: 'default',     tag: 'ending_drift',   videoUrl: '/videos/ch3_ending_neutral.mp4' },
        ],
      },
    ],
  },

  // ── Night Shift · Episode 1 ───────────────────────────────────────────────
  {
    id:       'night1',
    seriesId: 'series3',
    number:   1,
    video:    '',
    title:    'Rounds',
    questionnaire: [
      {
        id:   'q1',
        text: 'The ward is empty. You…',
        options: [
          { id: 'check', label: 'Check the rooms', flags: { nerve: '+1' } },
          { id: 'call',  label: 'Call security',   flags: { caution: '+1' } },
        ],
      },
    ],
    flags: { nerve: 0, caution: 0 },
    chapters: [
      {
        id:    'ch1',
        title: 'The Ward',
        decisions: [
          {
            id:     'ch1_pre_1',
            phase:  'pre',
            window: 6000,
            prompt: 'A light flickers in room 3.',
            options: [
              { gesture: 'hands_up', label: 'Enter', set: { nerve: '+1' } },
              { gesture: 'crouch',   label: 'Wait',  set: { caution: '+1' } },
            ],
            default: { set: {} },
          },
        ],
        variants: [
          { in: 0.0, out: 12.0, when: 'nerve >= 1', tag: 'brave',   videoUrl: '/videos/ch1_confrontation.mp4' },
          { in: 0.0, out: 12.0, when: 'default',    tag: 'careful', videoUrl: '/videos/ch1_cautious.mp4' },
        ],
      },
      {
        id:    'ch2',
        title: 'Code Black',
        decisions: [],
        variants: [
          { in: 0.0, out: 12.0, when: 'nerve >= 1', tag: 'ending_survive', videoUrl: '/videos/ch3_ending_heroic.mp4' },
          { in: 0.0, out: 12.0, when: 'default',    tag: 'ending_lost',    videoUrl: '/videos/ch3_ending_dark.mp4' },
        ],
      },
    ],
  },
];
