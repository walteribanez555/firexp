import { useNavigate } from 'react-router-dom';
import { GitBranch, Film, ListChecks, Flag } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEpisode } from '../hooks/use-series';
import { useUploadVariant } from '../../uploads/hooks/use-upload';
import { VariantUploader } from '../../uploads/components/VariantUploader';
import type { EpisodeSummary } from '@fire-stick/types';

interface Props {
  episode: EpisodeSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Right-side drawer with an episode's details + the per-variant video upload service. */
export function EpisodeDrawer({ episode, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 w-full sm:max-w-xl">
        {episode ? (
          <EpisodeDrawerBody episode={episode} onClose={() => onOpenChange(false)} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EpisodeDrawerBody({ episode, onClose }: { episode: EpisodeSummary; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: detail, isLoading } = useEpisode(episode.id);
  const { uploadMutation, progresses } = useUploadVariant();

  function handleUpload(chapterId: string, variantTag: string, file: File) {
    if (!detail) return;
    uploadMutation.mutate({ episodeId: detail.id, chapterId, variantTag, file, episode: detail });
  }

  const totalVariants = detail?.chapters.reduce((s, ch) => s + ch.variants.length, 0) ?? 0;
  const uploadedVariants =
    detail?.chapters.reduce((s, ch) => s + ch.variants.filter((v) => !!v.videoUrl).length, 0) ?? 0;

  return (
    <>
      <SheetHeader className="border-b pb-4">
        <SheetTitle className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          Ep {episode.number} — {episode.title}
        </SheetTitle>
        <SheetDescription>Episode details and per-branch video uploads.</SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading episode…</p>}

        {detail && (
          <>
            {/* Meta */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Meta icon={<Film className="h-4 w-4" />} label="Chapters" value={detail.chapters.length} />
              <Meta icon={<ListChecks className="h-4 w-4" />} label="Questions" value={detail.questionnaire.length} />
              <Meta
                icon={<Film className="h-4 w-4" />}
                label="Videos"
                value={`${uploadedVariants}/${totalVariants}`}
              />
            </div>

            {/* Flags */}
            {Object.keys(detail.flags ?? {}).length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" /> Initial flags
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(detail.flags).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="font-mono text-xs">
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Chapters + upload service */}
            <div className="space-y-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Video uploads
              </p>
              {detail.chapters.map((chapter) => (
                <div key={chapter.id}>
                  <p className="mb-2 text-sm font-medium">{chapter.title}</p>
                  <div className="space-y-2 pl-1">
                    {chapter.variants.map((variant, i) => (
                      <VariantUploader
                        key={i}
                        chapterId={chapter.id}
                        variant={variant}
                        progress={progresses.get(`${chapter.id}:${variant.tag ?? 'default'}`)}
                        onUpload={handleUpload}
                      />
                    ))}
                    {chapter.variants.length === 0 && (
                      <p className="text-xs text-muted-foreground">No variants</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <SheetFooter className="border-t pt-4">
        <Button
          className="flex-1"
          onClick={() => {
            onClose();
            navigate(`/flow/${episode.id}`);
          }}
        >
          <GitBranch className="mr-1.5 h-4 w-4" /> Open Flow Editor
        </Button>
      </SheetFooter>
    </>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}
