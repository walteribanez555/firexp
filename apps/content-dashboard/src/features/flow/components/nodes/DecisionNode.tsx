import { Handle, Position, type NodeProps } from '@xyflow/react';
import { HelpCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DecisionNodeData } from '../../lib/episode-to-flow';

export function DecisionNode({ data, selected }: NodeProps) {
  const d = data as DecisionNodeData;
  const { decision, inconsequential } = d;

  return (
    <div
      className={[
        'rounded-lg border-2 bg-card text-card-foreground shadow-lg min-w-[220px] max-w-[280px]',
        selected ? 'border-amber' : 'border-amber/40',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 bg-amber/10 px-3 py-2 rounded-t-md">
        <HelpCircle className="h-4 w-4 text-amber shrink-0" />
        <span className="font-semibold text-sm text-amber truncate">
          {decision.phase === 'pre' ? 'Pre' : `During @${decision.at ?? '?'}s`}
        </span>
        <Badge variant="outline" className="ml-auto text-[10px] py-0 border-amber/50 text-amber">
          {decision.window / 1000}s
        </Badge>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {/* A4: inconsequential-decision badge */}
        {inconsequential && (
          <div className="flex items-center gap-1 rounded bg-amber/10 border border-amber/30 px-2 py-1">
            <AlertTriangle className="h-3 w-3 text-amber shrink-0" />
            <span className="text-[10px] font-medium text-amber">No consequence</span>
          </div>
        )}
        {decision.prompt && (
          <p className="text-xs text-foreground italic line-clamp-2">"{decision.prompt}"</p>
        )}
        <div className="space-y-1">
          {decision.options.map((opt, i) => (
            <div key={i} className="text-xs flex items-center gap-1.5">
              <span className="font-mono text-muted-foreground w-16 shrink-0">{opt.gesture}</span>
              <span className="flex-1 truncate">{opt.label}</span>
            </div>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
