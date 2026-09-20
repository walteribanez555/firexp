import { createContext, useContext } from 'react';
import { NodeToolbar, Position } from '@xyflow/react';
import { Copy, Trash2 } from 'lucide-react';

export interface NodeActions {
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const NodeActionsContext = createContext<NodeActions | null>(null);
export const NodeActionsProvider = NodeActionsContext.Provider;
export const useNodeActions = () => useContext(NodeActionsContext);

/** Floating toolbar shown above a node while it is selected. */
export function NodeActionsToolbar({ id, selected }: { id: string; selected?: boolean }) {
  const actions = useNodeActions();
  if (!actions) return null;
  return (
    <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
      <div className="flex items-center gap-0.5 rounded-md border bg-popover p-0.5 shadow-md">
        <button
          onClick={() => actions.onDuplicate(id)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-popover-foreground hover:bg-accent"
        >
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </button>
        <button
          onClick={() => actions.onDelete(id)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </NodeToolbar>
  );
}
