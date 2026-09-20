import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Video, CheckCircle, XCircle, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ChapterNodeData } from '../../lib/episode-to-flow';

interface Props extends NodeProps {
  isHighlighted?: boolean;
}

export function ChapterNode({ data, selected, isHighlighted }: Props) {
  const d = data as ChapterNodeData;
  const { chapter, index, shadowedVariantIndices } = d;

  return (
    <div
      className={[
        'rounded-lg border-2 bg-card text-card-foreground shadow-lg min-w-[240px] max-w-[280px]',
        selected ? 'border-primary' : isHighlighted ? 'border-amber' : 'border-border',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 bg-secondary/60 px-3 py-2 rounded-t-md">
        <Video className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-semibold text-sm truncate">
          Ch {index + 1}: {chapter.title}
        </span>
      </div>
      <div className="px-3 py-2 space-y-1">
        {chapter.variants.map((v, i) => {
          const isShadowed = shadowedVariantIndices?.includes(i) ?? false;
          return (
            <div
              key={i}
              className={[
                'text-xs flex items-center gap-1.5 py-0.5 rounded',
                isShadowed ? 'bg-amber/10 px-1' : '',
              ].join(' ')}
            >
              {v.videoUrl ? (
                <CheckCircle className="h-3 w-3 text-primary shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive shrink-0" />
              )}
              <span
                className={[
                  'font-mono flex-1 truncate',
                  isShadowed ? 'text-amber/70' : 'text-muted-foreground',
                ].join(' ')}
              >
                {v.when}
              </span>
              {isShadowed && (
                <EyeOff className="h-3 w-3 text-amber shrink-0" aria-label="Unreachable — shadowed by earlier default" />
              )}
              {v.tag && !isShadowed && (
                <Badge variant="outline" className="text-[10px] py-0 px-1">
                  {v.tag}
                </Badge>
              )}
            </div>
          );
        })}
        {chapter.variants.length === 0 && (
          <p className="text-xs text-muted-foreground">No variants</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
