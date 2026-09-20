import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAllSeries, useEpisode } from '../series/hooks/use-series';
import { useUploadVariant } from './hooks/use-upload';
import { VariantUploader } from './components/VariantUploader';
import type { EpisodeSummary } from '@fire-stick/types';

export function UploadsRoute() {
  const navigate = useNavigate();
  const { data: seriesList, isLoading } = useAllSeries();
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeSummary | null>(null);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/series')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Series
        </Button>
        <h1 className="text-xl font-semibold">Video Uploads</h1>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {/* Series + episodes picker */}
      <div className="space-y-4">
        {seriesList?.map((series) => (
          <Card key={series.id}>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">{series.title}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {series.episodes.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() =>
                    setSelectedEpisode((prev) => (prev?.id === ep.id ? null : ep))
                  }
                  className="flex items-center justify-between w-full rounded-md border px-3 py-2 hover:bg-accent text-sm"
                >
                  <span>Ep {ep.number} — {ep.title}</span>
                  <div className="flex items-center gap-2">
                    {selectedEpisode?.id === ep.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </button>
              ))}
              {series.episodes.length === 0 && (
                <p className="text-xs text-muted-foreground">No episodes</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Episode detail panel */}
      {selectedEpisode && (
        <EpisodeUploads episode={selectedEpisode} />
      )}
    </div>
  );
}

function EpisodeUploads({ episode }: { episode: EpisodeSummary }) {
  const { data: detail, isLoading } = useEpisode(episode.id);
  const { uploadMutation, progresses } = useUploadVariant();

  function handleUpload(chapterId: string, variantTag: string, file: File) {
    if (!detail) return;
    uploadMutation.mutate({
      episodeId: detail.id,
      chapterId,
      variantTag,
      file,
      episode: detail,
    });
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading episode…</p>;
  }

  if (!detail) return null;

  const totalVariants = detail.chapters.reduce((sum, ch) => sum + ch.variants.length, 0);
  const uploadedVariants = detail.chapters.reduce(
    (sum, ch) => sum + ch.variants.filter((v) => !!v.videoUrl).length,
    0,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <CardTitle className="text-base">
          Ep {episode.number} — {episode.title}
        </CardTitle>
        <Badge variant={uploadedVariants === totalVariants ? 'default' : 'secondary'}>
          {uploadedVariants}/{totalVariants} uploaded
        </Badge>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {detail.chapters.map((chapter) => (
          <div key={chapter.id}>
            <p className="text-sm font-medium mb-2">{chapter.title}</p>
            <div className="space-y-2 pl-2">
              {chapter.variants.map((variant, i) => {
                const tag = variant.tag ?? 'default';
                const progressKey = `${chapter.id}:${tag}`;
                return (
                  <VariantUploader
                    key={i}
                    chapterId={chapter.id}
                    variant={variant}
                    progress={progresses.get(progressKey)}
                    onUpload={handleUpload}
                  />
                );
              })}
              {chapter.variants.length === 0 && (
                <p className="text-xs text-muted-foreground">No variants</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
