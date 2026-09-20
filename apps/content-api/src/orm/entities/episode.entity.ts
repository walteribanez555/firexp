import type { EpisodeDetail, StoryChapter, Question, Flags } from '@fire-stick/types';

/**
 * DynamoDB item shape for an Episode.
 * Extends EpisodeDetail with parent-link + audit fields.
 */
export interface EpisodeItem extends Record<string, unknown> {
  id:            string;
  seriesId:      string;
  number:        number;
  title:         string;
  video:         string;
  questionnaire: Question[];
  flags:         Flags;
  chapters:      StoryChapter[];
  createdAt:     string;
  updatedAt:     string;
}

export function toEpisodeDetail(item: EpisodeItem): EpisodeDetail {
  return {
    id:            item.id,
    seriesId:      item.seriesId,
    number:        item.number,
    title:         item.title,
    video:         item.video,
    questionnaire: item.questionnaire,
    flags:         item.flags,
    chapters:      item.chapters,
  };
}
