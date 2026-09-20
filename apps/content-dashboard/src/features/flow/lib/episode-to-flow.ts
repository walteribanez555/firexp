/**
 * Pure mapper: EpisodeDetail <-> React Flow nodes + edges.
 *
 * Node types:
 *   "start"    — one per episode, shows initial flags
 *   "chapter"  — one per StoryChapter, shows variants with when/tag/video
 *   "decision" — one per ChapterDecision, shows prompt + options
 *
 * Edge topology (left-to-right via dagre top-down):
 *   start → chapter[0]
 *   chapter[i] → pre-decisions of chapter[i] → chapter[i] (chapter waits)
 *   chapter[i] → chapter[i+1]   (sequential story chapters)
 *   decision → chapter[i] for "during" decisions (back-reference not drawn; kept as label)
 */

import type { EpisodeDetail, StoryChapter, ChapterDecision } from '@fire-stick/types';
import type { Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';

// ─── Node data shapes ───────────────────────────────────────────────────────

export interface StartNodeData extends Record<string, unknown> {
  type: 'start';
  flags: Record<string, number>;
  video: string;
  episodeTitle: string;
}

export interface ChapterNodeData extends Record<string, unknown> {
  type: 'chapter';
  chapter: StoryChapter;
  index: number;
  /** Indices (within chapter.variants) of variants that are shadowed (unreachable). */
  shadowedVariantIndices: number[];
}

export interface DecisionNodeData extends Record<string, unknown> {
  type: 'decision';
  decision: ChapterDecision;
  chapterId: string;
  /** True when this decision has no downstream effect on variant selection. */
  inconsequential: boolean;
}

export type FlowNodeData = StartNodeData | ChapterNodeData | DecisionNodeData;
export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<Record<string, unknown>>;

const NODE_WIDTH  = 260;
const NODE_HEIGHT_START    = 120;
const NODE_HEIGHT_CHAPTER  = 200;
const NODE_HEIGHT_DECISION = 160;

function nodeHeight(type: 'start' | 'chapter' | 'decision'): number {
  if (type === 'start') return NODE_HEIGHT_START;
  if (type === 'chapter') return NODE_HEIGHT_CHAPTER;
  return NODE_HEIGHT_DECISION;
}

// ─── episode → flow ─────────────────────────────────────────────────────────

export function episodeToFlow(episode: EpisodeDetail): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  // Start node
  const startId = 'node-start';
  nodes.push({
    id: startId,
    type: 'startNode',
    position: { x: 0, y: 0 },
    data: {
      type: 'start',
      flags: episode.flags,
      video: episode.video,
      episodeTitle: episode.title,
    } satisfies StartNodeData,
  });

  let prevId = startId;

  episode.chapters.forEach((chapter, idx) => {
    const chapterId = `node-chapter-${chapter.id}`;

    nodes.push({
      id: chapterId,
      type: 'chapterNode',
      position: { x: 0, y: 0 },
      data: {
        type: 'chapter',
        chapter,
        index: idx,
        shadowedVariantIndices: [],   // populated later by the flow editor after analysis
      } satisfies ChapterNodeData,
    });

    edges.push({
      id: `edge-${prevId}-${chapterId}`,
      source: prevId,
      target: chapterId,
      animated: idx === 0,
      label: idx === 0 ? 'start' : undefined,
    });

    // Decision nodes
    chapter.decisions.forEach((decision) => {
      const decId = `node-decision-${decision.id}`;
      nodes.push({
        id: decId,
        type: 'decisionNode',
        position: { x: 0, y: 0 },
        data: {
          type: 'decision',
          decision,
          chapterId: chapter.id,
          inconsequential: false,     // populated later by the flow editor after analysis
        } satisfies DecisionNodeData,
      });

      edges.push({
        id: `edge-${chapterId}-${decId}`,
        source: chapterId,
        target: decId,
        label: decision.phase === 'pre' ? 'pre-decision' : `during @${decision.at ?? '?'}s`,
        style: { strokeDasharray: '4 2' },
      });
    });

    prevId = chapterId;
  });

  // Auto-layout with dagre
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });

  nodes.forEach((n) => {
    const t = (n.data as FlowNodeData).type;
    g.setNode(n.id, { width: NODE_WIDTH, height: nodeHeight(t) });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const layouted = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - nodeHeight((n.data as FlowNodeData).type) / 2,
      },
    };
  });

  return { nodes: layouted, edges };
}

// ─── flow → episode ─────────────────────────────────────────────────────────

/**
 * Reconstruct an updated EpisodeDetail from the flow state.
 * Node data carries the authoritative chapter/decision objects.
 */
export function flowToEpisode(
  base: EpisodeDetail,
  nodes: FlowNode[],
): EpisodeDetail {
  const startNode = nodes.find((n) => (n.data as FlowNodeData).type === 'start');
  const startData = startNode?.data as StartNodeData | undefined;

  // Maintain chapter order by the y-position of chapter nodes
  const chapterNodes = nodes
    .filter((n) => (n.data as FlowNodeData).type === 'chapter')
    .sort((a, b) => a.position.y - b.position.y);

  const decisionNodes = nodes.filter((n) => (n.data as FlowNodeData).type === 'decision');

  const chapters: StoryChapter[] = chapterNodes.map((cn) => {
    const cData = cn.data as ChapterNodeData;
    // Find decisions that belong to this chapter
    const decisions = decisionNodes
      .filter((dn) => (dn.data as DecisionNodeData).chapterId === cData.chapter.id)
      .map((dn) => (dn.data as DecisionNodeData).decision);
    return { ...cData.chapter, decisions };
  });

  return {
    ...base,
    video: startData?.video ?? base.video,
    title: startData?.episodeTitle ?? base.title,
    flags: startData?.flags ?? base.flags,
    chapters,
  };
}
