import { useCallback } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoryVariant } from '@fire-stick/types';
import type { UploadProgress, UploadStatus } from '../hooks/use-upload';

interface Props {
  chapterId: string;
  variant: StoryVariant;
  progress?: UploadProgress;
  onUpload: (chapterId: string, variantTag: string, file: File) => void;
}

export function VariantUploader({ chapterId, variant, progress, onUpload }: Props) {
  const tag    = variant.tag ?? 'default';
  const status = (progress?.status ?? 'idle') as UploadStatus;

  // Statuses that show the spinner / active-upload border style.
  const isActive = (s: UploadStatus) =>
    s === 'presigning' || s === 'uploading' || s === 'completing' || s === 'patching';

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onUpload(chapterId, tag, file);
    },
    [chapterId, tag, onUpload],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(chapterId, tag, file);
    },
    [chapterId, tag, onUpload],
  );

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={[
        'relative rounded-md border-2 border-dashed p-3 transition-colors',
        status === 'done'  ? 'border-primary/50 bg-primary/10' :
        status === 'error' ? 'border-destructive/50 bg-destructive/10' :
        isActive(status)   ? 'border-primary/50 bg-primary/5' :
        'border-border hover:border-primary/50 hover:bg-accent/30',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div className="shrink-0">
          {status === 'done' && <CheckCircle className="h-5 w-5 text-primary" />}
          {status === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}
          {isActive(status) && (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          )}
          {status === 'idle' && <Upload className="h-5 w-5 text-muted-foreground" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {variant.when === 'default' ? 'default' : variant.when}
            {variant.tag && <span className="ml-1 text-xs text-muted-foreground">({variant.tag})</span>}
          </p>
          {variant.videoUrl && !isActive(status) && status !== 'error' && (
            <p className="text-xs text-primary truncate">{variant.videoUrl}</p>
          )}
          {status === 'uploading' && (
            <div className="mt-1">
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${progress?.progress ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {progress?.progress ?? 0}% — uploading
              </p>
            </div>
          )}
          {status === 'completing' && (
            <div className="mt-1">
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-200" style={{ width: '99%' }} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Completing upload…</p>
            </div>
          )}
          {status === 'presigning' && <p className="text-xs text-muted-foreground">Getting upload URL…</p>}
          {status === 'patching'   && <p className="text-xs text-muted-foreground">Saving…</p>}
          {status === 'error'      && <p className="text-xs text-destructive">{progress?.error}</p>}
        </div>

        {/* Upload button */}
        {(status === 'idle' || status === 'done' || status === 'error') ? (
          <label className="shrink-0">
            <input
              type="file"
              accept="video/mp4,video/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button size="sm" variant="outline" asChild>
              <span className="cursor-pointer">
                <Upload className="h-3.5 w-3.5 mr-1" />
                {status === 'done' ? 'Replace' : 'Upload'}
              </span>
            </Button>
          </label>
        ) : null}
      </div>
    </div>
  );
}
