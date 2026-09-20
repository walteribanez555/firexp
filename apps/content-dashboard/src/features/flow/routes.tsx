import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import {
  Save,
  Plus,
  GitBranch,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  findInconsequentialDecisions,
  findShadowedVariants,
  validateEpisode,
} from '@fire-stick/story-graph';
import { useEpisode, useUpdateEpisode } from '../series/hooks/use-series';
import {
  episodeToFlow,
  flowToEpisode,
  type FlowNode,
  type FlowEdge,
  type ChapterNodeData,
  type DecisionNodeData,
} from './lib/episode-to-flow';
import { StartNode } from './components/nodes/StartNode';
import { ChapterNode } from './components/nodes/ChapterNode';
import { DecisionNode } from './components/nodes/DecisionNode';
import { NodeEditPanel } from './components/NodeEditPanel';
import { SimulatePanel } from './components/SimulatePanel';
import { NodeActionsProvider } from './node-actions';
import type { EpisodeDetail } from '@fire-stick/types';

// NodeTypes accepts ComponentType<NodeProps & {data: any; type: any}>
// Our node components accept NodeProps which satisfies this contract at runtime.
const nodeTypes = {
  startNode: StartNode,
  chapterNode: ChapterNode,
  decisionNode: DecisionNode,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as Record<string, React.ComponentType<any>>;

let newNodeCounter = 0;

/**
 * Annotate the flow nodes with analysis results from @fire-stick/story-graph:
 *   - ChapterNodeData.shadowedVariantIndices  (findShadowedVariants per chapter)
 *   - DecisionNodeData.inconsequential        (findInconsequentialDecisions per episode)
 *
 * Returns the annotated node array and the count of inconsequential decisions.
 */
function annotateNodes(
  nodes: FlowNode[],
  episode: EpisodeDetail,
): { annotated: FlowNode[]; inconsequentialCount: number } {
  const inconsequentialTuples = findInconsequentialDecisions(episode);
  const inconsequentialIds = new Set(inconsequentialTuples.map((t) => t.decisionId));

  // Build a map of chapterId → shadowed-variant-indices
  const shadowedMap = new Map<string, number[]>();
  for (const chapter of episode.chapters) {
    const shadowed = findShadowedVariants(chapter);
    if (shadowed.length > 0) {
      shadowedMap.set(
        chapter.id,
        shadowed.map((sv) => chapter.variants.indexOf(sv)),
      );
    }
  }

  const annotated = nodes.map((n): FlowNode => {
    const d = n.data;
    if ((d as { type: string }).type === 'chapter') {
      const cd = d as ChapterNodeData;
      return {
        ...n,
        data: {
          ...cd,
          shadowedVariantIndices: shadowedMap.get(cd.chapter.id) ?? [],
        },
      };
    }
    if ((d as { type: string }).type === 'decision') {
      const dd = d as DecisionNodeData;
      return {
        ...n,
        data: {
          ...dd,
          inconsequential: inconsequentialIds.has(dd.decision.id),
        },
      };
    }
    return n;
  });

  return { annotated, inconsequentialCount: inconsequentialTuples.length };
}

/** Embeddable flow editor for a single episode (rendered inside the Series workspace). */
export function FlowEditor({ episodeId }: { episodeId: string }) {
  const { data: episode, isLoading } = useEpisode(episodeId ?? '');
  const updateEpisode = useUpdateEpisode();

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [highlightedChapters, setHighlightedChapters] = useState<string[]>([]);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [inconsequentialCount, setInconsequentialCount] = useState(0);
  const rfRef = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);

  // Initialise flow when episode loads and run A4 analysis
  useEffect(() => {
    if (!episode) return;
    const { nodes: n, edges: e } = episodeToFlow(episode);
    const { annotated, inconsequentialCount: count } = annotateNodes(n as FlowNode[], episode);
    setNodes(annotated as FlowNode[]);
    setEdges(e as FlowEdge[]);
    setInconsequentialCount(count);
    // Fit the freshly-loaded graph once the DOM has the new nodes (embedded
    // canvas mounts with the container already sized, so plain `fitView` misses).
    requestAnimationFrame(() => rfRef.current?.fitView({ padding: 0.2, duration: 200 }));
  }, [episode, setNodes, setEdges]);

  // ── Node actions (duplicate / delete) ────────────────────────────────────────
  const onDeleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id) as FlowNode[]);
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id) as FlowEdge[]);
      setSelectedNode((sel) => (sel?.id === id ? null : sel));
    },
    [setNodes, setEdges],
  );

  const onDuplicateNode = useCallback(
    (id: string) => {
      setNodes((nds) => {
        const orig = nds.find((n) => n.id === id);
        if (!orig) return nds;
        const t = (orig.data as { type: string }).type;
        newNodeCounter += 1;

        let newId: string;
        let data: FlowNode['data'];
        if (t === 'chapter') {
          const cd = orig.data as ChapterNodeData;
          newId = `node-chapter-new-${newNodeCounter}`;
          data = {
            ...cd,
            chapter: {
              ...cd.chapter,
              id: `ch-new-${newNodeCounter}`,
              title: `${cd.chapter.title} copy`,
              decisions: [],
              variants: cd.chapter.variants.map((v) => ({ ...v })),
            },
            shadowedVariantIndices: [],
          };
        } else if (t === 'decision') {
          const dd = orig.data as DecisionNodeData;
          newId = `node-decision-new-${newNodeCounter}`;
          data = {
            ...dd,
            decision: {
              ...dd.decision,
              id: `dec-new-${newNodeCounter}`,
              options: dd.decision.options.map((o) => ({ ...o })),
            },
            inconsequential: false,
          };
        } else {
          return nds; // start node is not duplicable
        }

        const clone: FlowNode = {
          ...orig,
          id: newId,
          position: { x: orig.position.x + 48, y: orig.position.y + 48 },
          selected: false,
          data,
        };
        return [...nds, clone] as FlowNode[];
      });
    },
    [setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge(connection, eds) as FlowEdge[]),
    [setEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => setSelectedNode(node),
    [],
  );

  function handleNodeChange(updated: FlowNode) {
    setNodes((nds) => nds.map((n) => (n.id === updated.id ? updated : n)) as FlowNode[]);
    setSelectedNode(updated);
  }

  function addChapter() {
    if (!episode) return;
    newNodeCounter += 1;
    const id = `node-chapter-new-${newNodeCounter}`;
    const newNode: FlowNode = {
      id,
      type: 'chapterNode',
      position: { x: 100, y: 400 + newNodeCounter * 50 },
      data: {
        type: 'chapter',
        index: nodes.filter((n) => (n.data as {type: string}).type === 'chapter').length,
        chapter: {
          id: `ch-new-${newNodeCounter}`,
          title: `New Chapter ${newNodeCounter}`,
          decisions: [],
          variants: [],
        },
        shadowedVariantIndices: [],
      },
    };
    setNodes((nds) => [...nds, newNode] as FlowNode[]);
  }

  function addDecision() {
    if (!selectedNode) {
      toast.error('Select a chapter node first');
      return;
    }
    const nd = selectedNode.data as { type: string };
    if (nd.type !== 'chapter') {
      toast.error('Select a chapter node to add a decision');
      return;
    }
    newNodeCounter += 1;
    const id = `node-decision-new-${newNodeCounter}`;
    const chData = selectedNode.data as { chapter: { id: string } };
    const newNode: FlowNode = {
      id,
      type: 'decisionNode',
      position: {
        x: selectedNode.position.x + 300,
        y: selectedNode.position.y,
      },
      data: {
        type: 'decision',
        chapterId: chData.chapter.id,
        decision: {
          id: `dec-new-${newNodeCounter}`,
          phase: 'pre',
          window: 6000,
          prompt: '',
          options: [],
          default: { set: {} },
        },
        inconsequential: false,
      },
    };
    setNodes((nds) => [...nds, newNode] as FlowNode[]);
  }

  function handleSave() {
    if (!episode || !episodeId) return;
    const updated: EpisodeDetail = flowToEpisode(episode, nodes);

    // ── Pre-save validation via @fire-stick/story-graph ──────────────────────
    const result = validateEpisode(updated);

    const errors = result.issues.filter((i) => i.severity === 'error');
    const warnings = result.issues.filter((i) => i.severity === 'warning');

    // Show warnings (non-blocking)
    for (const w of warnings) {
      toast.warning(w.message, { description: w.path });
    }

    if (errors.length > 0) {
      // Block save and show each error
      for (const err of errors) {
        toast.error(err.message, { description: err.path });
      }
      toast.error(`Save blocked: ${errors.length} validation error${errors.length > 1 ? 's' : ''}`);
      return;
    }

    updateEpisode.mutate({ id: episodeId, payload: updated });
  }

  const chapters = useMemo(
    () =>
      nodes
        .filter((n) => (n.data as { type: string }).type === 'chapter')
        .map((n) => (n.data as { chapter: EpisodeDetail['chapters'][number] }).chapter),
    [nodes],
  );

  const initialFlags = useMemo(
    () => episode?.flags ?? {},
    [episode],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading episode…
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Episode not found.
      </div>
    );
  }

  // ── Shadowed-variant summary (for the banner) ───────────────────────────────
  const totalShadowedVariants = nodes.reduce((acc, n) => {
    if ((n.data as { type: string }).type === 'chapter') {
      return acc + ((n.data as ChapterNodeData).shadowedVariantIndices?.length ?? 0);
    }
    return acc;
  }, 0);

  const showWarningBanner = inconsequentialCount > 0 || totalShadowedVariants > 0;

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          <Button size="sm" variant="outline" onClick={addChapter}>
            <Plus className="h-4 w-4 mr-1" /> Chapter
          </Button>
          <Button size="sm" variant="outline" onClick={addDecision}>
            <GitBranch className="h-4 w-4 mr-1" /> Decision
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateEpisode.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            {updateEpisode.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {/* A4 summary banner */}
        {showWarningBanner && (
          <div className="absolute top-14 left-3 right-3 z-10 flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1">
              {[
                inconsequentialCount > 0 &&
                  `${inconsequentialCount} decision${inconsequentialCount > 1 ? 's' : ''} have no downstream effect`,
                totalShadowedVariants > 0 &&
                  `${totalShadowedVariants} variant${totalShadowedVariants > 1 ? 's' : ''} are unreachable (shadowed)`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <XCircle
              className="h-3.5 w-3.5 shrink-0 cursor-pointer opacity-60 hover:opacity-100"
              onClick={() => setInconsequentialCount(0)}
            />
          </div>
        )}

        {/* Simulate toggle */}
        <div className="absolute bottom-16 left-3 z-10">
          <Card className="w-56 overflow-hidden">
            <button
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => setSimulateOpen((o) => !o)}
            >
              Simulate Flags
              {simulateOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            {simulateOpen && (
              <div className="px-3 pb-3 border-t">
                <SimulatePanel
                  initialFlags={initialFlags}
                  chapters={chapters}
                  onHighlight={setHighlightedChapters}
                />
              </div>
            )}
          </Card>
        </div>

        <NodeActionsProvider value={{ onDuplicate: onDuplicateNode, onDelete: onDeleteNode }}>
          <ReactFlow
            onInit={(instance) => {
              rfRef.current = instance;
              instance.fitView({ padding: 0.2 });
            }}
            nodes={nodes.map((n) => {
              const t = (n.data as { type: string }).type;
              if (t === 'chapter') {
                const chId = (n.data as { chapter: { id: string } }).chapter.id;
                return {
                  ...n,
                  data: {
                    ...n.data,
                    isHighlighted: highlightedChapters.includes(chId),
                  },
                };
              }
              return n;
            })}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            fitView
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(215 20.2% 25%)" />
            <Controls />
          </ReactFlow>
        </NodeActionsProvider>
      </div>

      {/* Right panel */}
      {selectedNode && (
        <div className="w-72 border-l bg-card flex flex-col overflow-hidden">
          <NodeEditPanel
            node={selectedNode}
            episodeId={episode.id}
            onChange={handleNodeChange}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}
    </div>
  );
}
