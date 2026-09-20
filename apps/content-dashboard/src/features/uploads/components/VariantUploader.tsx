import { useCallback, useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn, formatBytes, basename } from '@/lib/utils';
import type { StoryVariant } from '@fire-stick/types';
import type { UploadProgress, UploadStatus } from '../hooks/use-upload';

interface Props {
  chapterId: string;
  variant: StoryVariant;
  progress?: UploadProgress;
  onUpload: (chapterId: string, variantTag: string, file: File) => void;
}

const ACTIVE: UploadStatus[] = ['presigning', 'uploading', 'completing', 'patching'];

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: '',
  presigning: 'Preparing…',
  uploading: 'Uploading',
  completing: 'Finalizing…',
  patching: 'Saving…',
  done: 'Uploaded',
  error: 'Failed',
};

/** Compact, width-safe video slot for a single branch. Lives in the flow node panel. */
export function VariantUploader({ chapterId, variant, progress, onUpload }: Props) {
  const tag = variant.tag ?? 'default';
  const status = (progress?.status ?? 'idle') as UploadStatus;
  const isActive = ACTIVE.includes(status);
  const hasVideo = !!variant.videoUrl;
  const [dragging, setDragging] = useState(false);

  const submit = useCallback(
    (file?: File | null) => {
      if (file) onUpload(chapterId, tag, file);
    },
    [chapterId, tag, onUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!isActive) submit(e.dataTransfer.files?.[0]);
    },
    [isActive, submit],
  );

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!isActive) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  // ── Uploading / working ──────────────────────────────────────
  if (isActive) {
    const showBar = status === 'uploading' || status === 'completing';
    const shown = status === 'completing' ? 99 : progress?.progress ?? 0;
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-foreground">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          <span className="truncate">
            {STATUS_LABEL[status]}
            {progress?.fileName ? <span className="text-muted-foreground"> · {progress.fileName}</span> : null}
          </span>
          {showBar && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{shown}%</span>}
        </div>
        {showBar && <Progress value={shown} className="h-1" />}
      </div>
    );
  }

  // ── Has a video (done or persisted) ──────────────────────────
  if (hasVideo) {
    return (
      <div {...dragProps} className={cn('rounded-md border p-1.5', dragging && 'border-primary bg-primary/10')}>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs" title={variant.videoUrl}>
            {basename(variant.videoUrl!)}
            {progress?.fileSize ? (
              <span className="text-muted-foreground"> · {formatBytes(progress.fileSize)}</span>
            ) : null}
          </span>
          <a
            href={variant.videoUrl}
            target="_blank"
            rel="noreferrer"
            title="Open video"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <label
            title="Replace video"
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <input type="file" accept="video/mp4,video/*" className="hidden" onChange={(e) => submit(e.target.files?.[0])} />
            <RefreshCw className="h-3.5 w-3.5" />
          </label>
        </div>
      </div>
    );
  }

  // ── Empty (idle / error) — full-width dropzone ───────────────
  return (
    <label
      {...dragProps}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-2 py-3 text-center transition-colors',
        dragging
          ? 'border-primary bg-primary/10'
          : status === 'error'
            ? 'border-destructive/50 bg-destructive/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/40',
      )}
    >
      <input type="file" accept="video/mp4,video/*" className="hidden" onChange={(e) => submit(e.target.files?.[0])} />
      {status === 'error' ? (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-xs text-destructive">{progress?.error ?? 'Upload failed'}</span>
          <span className="text-[11px] text-muted-foreground">Click to retry</span>
        </>
      ) : (
        <>
          <UploadCloud className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Upload video</span>
          <span className="text-[11px] text-muted-foreground">Drag &amp; drop or click · MP4</span>
        </>
      )}
    </label>
  );
}
