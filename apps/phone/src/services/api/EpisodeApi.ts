import type { EpisodeDetail } from '@fire-stick/types';

export interface QuestionnaireAnswer {
  questionId: string;
  optionId:   string;
}

export interface QuestionnaireResult {
  chapterId: string;
  flags:     Record<string, number>;
}

export class EpisodeApi {
  constructor(private readonly relayHost: string) {}

  async fetchEpisode(episodeId: string): Promise<EpisodeDetail> {
    const res = await fetch(`${this.relayHost}/api/v1/episodes/${episodeId}`);
    if (!res.ok) throw new Error(`Episode fetch failed: ${res.status}`);
    const body = await res.json() as { data: EpisodeDetail };
    return body.data;
  }

  async submitQuestionnaire(
    roomCode:  string,
    episodeId: string,
    answers:   QuestionnaireAnswer[],
  ): Promise<QuestionnaireResult> {
    const res = await fetch(`${this.relayHost}/api/v1/rooms/${roomCode}/questionnaire`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ episodeId, answers }),
    });
    if (!res.ok) throw new Error(`Questionnaire submit failed: ${res.status}`);
    const body = await res.json() as { data: QuestionnaireResult };
    return body.data;
  }

  async fetchRoomLog(roomCode: string): Promise<{ log: unknown[] }> {
    const res = await fetch(`${this.relayHost}/api/v1/rooms/${roomCode}`);
    if (!res.ok) throw new Error(`Room log fetch failed: ${res.status}`);
    const body = await res.json() as { data: { log: unknown[] } };
    return body.data;
  }
}
