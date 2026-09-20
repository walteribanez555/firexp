import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';
import type { StartNodeData } from '../../lib/episode-to-flow';

export function StartNode({ data }: NodeProps) {
  const d = data as StartNodeData;
  return (
    <div className="rounded-lg border-2 border-primary bg-card text-card-foreground shadow-lg min-w-[220px]">
      <div className="flex items-center gap-2 bg-primary/20 px-3 py-2 rounded-t-md">
        <Play className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm text-primary truncate">{d.episodeTitle}</span>
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-xs text-muted-foreground">Video: {d.video}</p>
        <div className="text-xs">
          <span className="text-muted-foreground">Initial flags: </span>
          {Object.entries(d.flags).map(([k, v]) => (
            <span key={k} className="inline-flex items-center rounded bg-secondary px-1.5 mr-1 text-secondary-foreground">
              {k}={v}
            </span>
          ))}
          {Object.keys(d.flags).length === 0 && (
            <span className="text-muted-foreground">none</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
