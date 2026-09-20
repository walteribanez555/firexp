import type { Action } from '@fire-stick/types';

export type PromptMode = 'ai' | 'random' | 'static';
export type PromptTone = 'tense' | 'hopeful' | 'urgent' | 'mysterious' | 'neutral';

export interface GeneratedPrompt {
  prompt:      string;
  tone:        PromptTone;
  /** The action the prompt is subtly favoring, or null if neutral */
  nudgeTarget: Action | null;
  /** How the prompt was generated */
  source:      PromptMode;
}

export interface KbDecision {
  nudgeTarget:    Action | null;
  /** 0–1: how strong the nudge is. 0 = neutral, 1 = maximum. */
  nudgeStrength:  number;
  promptTemplates: {
    toward_hands_up?:     string[];
    toward_crouch?:       string[];
    toward_lean_forward?: string[];
    toward_cover_eyes?:   string[];
    toward_point_left?:   string[];
    toward_point_right?:  string[];
    toward_stand_up?:     string[];
    neutral:              string[];
  };
}

export interface KbChapter {
  tensionLevel:  number;  // 1–10
  characterMood: string;
  setting:       string;
  decisions:     Record<string, KbDecision>;
}

export interface KbArc {
  targetEnding: string;
  /** tension level per chapter (index = chapter index) */
  tensionCurve: number[];
  flagTargets:  Record<string, { direction: '+' | '-'; weight: number }>;
}

export interface KnowledgeBase {
  storyId:          string;
  title:            string;
  narrativeContext: string;
  desiredArc:       KbArc;
  chapters:         Record<string, KbChapter>;
}

export interface PromptRequest {
  decisionId: string;
  chapterId:  string;
  storyId:    string;
  options:    { gesture: Action; label: string }[];
  flags:      Record<string, number>;
}
