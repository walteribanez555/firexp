import { z } from 'zod';

export const seriesSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  thumbnailUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
});

export type SeriesFormValues = z.infer<typeof seriesSchema>;

// Episode number is auto-assigned by the backend (unique per series), so the
// form only captures the title.
export const episodeSchema = z.object({
  title: z.string().min(1, 'Title is required'),
});

export type EpisodeFormValues = z.infer<typeof episodeSchema>;
