import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VariantUploader } from '../../uploads/components/VariantUploader';
import { useVariantUpload } from '../../uploads/hooks/use-upload';
import type { FlowNode, StartNodeData, ChapterNodeData, DecisionNodeData } from '../lib/episode-to-flow';
import type { Action, StoryVariant, DecisionOption, FlagSet } from '@fire-stick/types';

const GESTURES: Action[] = [
  'hands_up', 'crouch', 'lean_forward', 'cover_eyes', 'point_left', 'point_right', 'stand_up',
];

/** Stable id for a variant used both as the S3 object tag and the progress key. */
function variantTag(v: StoryVariant, i: number): string {
  return v.tag?.trim() || `v${i}`;
}

interface Props {
  node: FlowNode;
  episodeId: string;
  onChange: (updated: FlowNode) => void;
  onClose: () => void;
}

export function NodeEditPanel({ node, episodeId, onChange, onClose }: Props) {
  const nodeType = (node.data as { type: string }).type;

  function patchData(patch: Partial<Record<string, unknown>>) {
    onChange({ ...node, data: { ...node.data, ...patch } });
  }

  if (nodeType === 'start') {
    return <StartEditor node={node} patchData={patchData} onClose={onClose} />;
  }
  if (nodeType === 'chapter') {
    return <ChapterEditor node={node} episodeId={episodeId} patchData={patchData} onClose={onClose} />;
  }
  if (nodeType === 'decision') {
    return <DecisionEditor node={node} patchData={patchData} onClose={onClose} />;
  }
  return null;
}

// ─── Start editor ────────────────────────────────────────────────────────────

function StartEditor({ node, patchData, onClose }: { node: FlowNode; patchData: (p: Partial<Record<string, unknown>>) => void; onClose: () => void }) {
  const d = node.data as StartNodeData;
  const [flagKey, setFlagKey] = useState('');
  const [flagVal, setFlagVal] = useState('0');

  function addFlag() {
    if (!flagKey.trim()) return;
    patchData({ flags: { ...d.flags, [flagKey.trim()]: Number(flagVal) } });
    setFlagKey('');
    setFlagVal('0');
  }

  function removeFlag(k: string) {
    const next = { ...d.flags };
    delete next[k];
    patchData({ flags: next });
  }

  return (
    <PanelShell title="Episode Start" onClose={onClose}>
      <Field label="Episode Title">
        <Input value={d.episodeTitle} onChange={(e) => patchData({ episodeTitle: e.target.value })} />
      </Field>
      <Field label="Video File">
        <Input value={d.video} onChange={(e) => patchData({ video: e.target.value })} />
      </Field>
      <div>
        <Label className="mb-2 block">Initial Flags</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(d.flags).map(([k, v]) => (
            <Badge key={k} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFlag(k)}>
              {k}={v} <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="flag name" value={flagKey} onChange={(e) => setFlagKey(e.target.value)} />
          <Input className="w-16" type="number" value={flagVal} onChange={(e) => setFlagVal(e.target.value)} />
          <Button size="sm" onClick={addFlag}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
    </PanelShell>
  );
}

// ─── Chapter editor ───────────────────────────────────────────────────────────

function ChapterEditor({ node, episodeId, patchData, onClose }: { node: FlowNode; episodeId: string; patchData: (p: Partial<Record<string, unknown>>) => void; onClose: () => void }) {
  const d = node.data as ChapterNodeData;
  const chapter = d.chapter;
  const { progresses, uploadVariant } = useVariantUpload();

  function updateVariant(i: number, patch: Partial<StoryVariant>) {
    const variants = chapter.variants.map((v, idx) => idx === i ? { ...v, ...patch } : v);
    patchData({ chapter: { ...chapter, variants } });
  }

  function addVariant() {
    const variants: StoryVariant[] = [
      ...chapter.variants,
      { in: 0, out: 0, when: 'default', tag: '', videoUrl: '' },
    ];
    patchData({ chapter: { ...chapter, variants } });
  }

  function removeVariant(i: number) {
    const variants = chapter.variants.filter((_, idx) => idx !== i);
    patchData({ chapter: { ...chapter, variants } });
  }

  // Upload the file for variant i, then link the resulting URL onto the step.
  async function handleUpload(i: number, file: File) {
    try {
      const url = await uploadVariant({
        episodeId,
        chapterId: chapter.id,
        variantTag: variantTag(chapter.variants[i], i),
        file,
      });
      updateVariant(i, { videoUrl: url });
    } catch {
      /* toast already shown by the hook */
    }
  }

  return (
    <PanelShell title={chapter.title || 'Chapter'} onClose={onClose}>
      <Field label="Title">
        <Input value={chapter.title} onChange={(e) => patchData({ chapter: { ...chapter, title: e.target.value } })} />
      </Field>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Branches</Label>
          <Button size="sm" variant="outline" onClick={addVariant}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        <div className="space-y-3">
          {chapter.variants.map((v, i) => (
            <div key={i} className="rounded-md border p-2.5 space-y-2.5 relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1.5 right-1.5 h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeVariant(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>

              {/* Video for this step — uploaded and linked in place */}
              <VariantUploader
                chapterId={chapter.id}
                variant={v}
                progress={progresses.get(`${chapter.id}:${variantTag(v, i)}`)}
                onUpload={(_cid, _tag, file) => handleUpload(i, file)}
              />

              <Field label="When">
                <Input
                  className="font-mono text-xs"
                  value={v.when}
                  onChange={(e) => updateVariant(i, { when: e.target.value })}
                  placeholder='confident >= 1  ·  default'
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Tag">
                  <Input value={v.tag ?? ''} onChange={(e) => updateVariant(i, { tag: e.target.value })} />
                </Field>
                <Field label="In (s)">
                  <Input type="number" value={v.in} onChange={(e) => updateVariant(i, { in: Number(e.target.value) })} />
                </Field>
                <Field label="Out (s)">
                  <Input type="number" value={v.out} onChange={(e) => updateVariant(i, { out: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          ))}
          {chapter.variants.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              No branches yet. Add one to attach a video.
            </p>
          )}
        </div>
      </div>
    </PanelShell>
  );
}

// ─── Decision editor ──────────────────────────────────────────────────────────

function DecisionEditor({ node, patchData, onClose }: { node: FlowNode; patchData: (p: Partial<Record<string, unknown>>) => void; onClose: () => void }) {
  const d = node.data as DecisionNodeData;
  const decision = d.decision;

  function updateDecision(patch: Partial<typeof decision>) {
    patchData({ decision: { ...decision, ...patch } });
  }

  function updateOption(i: number, patch: Partial<DecisionOption>) {
    const options = decision.options.map((o, idx) => idx === i ? { ...o, ...patch } : o);
    updateDecision({ options });
  }

  function addOption() {
    const options: DecisionOption[] = [
      ...decision.options,
      { gesture: 'hands_up', label: '', set: {} },
    ];
    updateDecision({ options });
  }

  function removeOption(i: number) {
    updateDecision({ options: decision.options.filter((_, idx) => idx !== i) });
  }

  function parseFlagSet(raw: string): FlagSet {
    const out: FlagSet = {};
    raw.split(',').forEach((pair) => {
      const [k, v] = pair.split('=').map((s) => s.trim());
      if (k && v !== undefined) out[k] = isNaN(Number(v)) ? v : Number(v);
    });
    return out;
  }

  function flagSetString(fs: FlagSet): string {
    return Object.entries(fs).map(([k, v]) => `${k}=${v}`).join(', ');
  }

  return (
    <PanelShell title={`Decision: ${decision.id}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Phase">
          <Select value={decision.phase} onValueChange={(v) => updateDecision({ phase: v as 'pre' | 'during' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pre">Pre</SelectItem>
              <SelectItem value="during">During</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {decision.phase === 'during' && (
          <Field label="At (s)">
            <Input type="number" value={decision.at ?? 0} onChange={(e) => updateDecision({ at: Number(e.target.value) })} />
          </Field>
        )}
        <Field label="Window (ms)">
          <Input type="number" value={decision.window} onChange={(e) => updateDecision({ window: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Prompt">
        <Textarea value={decision.prompt ?? ''} onChange={(e) => updateDecision({ prompt: e.target.value })} rows={2} />
      </Field>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Options</Label>
          <Button size="sm" variant="outline" onClick={addOption}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        <div className="space-y-2">
          {decision.options.map((opt, i) => (
            <div key={i} className="rounded border p-2 space-y-2 relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1 right-1 h-6 w-6 text-destructive"
                onClick={() => removeOption(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Gesture">
                  <Select value={opt.gesture} onValueChange={(v) => updateOption(i, { gesture: v as Action })}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GESTURES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Label">
                  <Input value={opt.label} onChange={(e) => updateOption(i, { label: e.target.value })} />
                </Field>
              </div>
              <Field label="Flag mutations (key=val, ...)">
                <Input
                  className="font-mono text-xs"
                  defaultValue={flagSetString(opt.set)}
                  onBlur={(e) => updateOption(i, { set: parseFlagSet(e.target.value) })}
                  placeholder="violent=+1, confident=-1"
                />
              </Field>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PanelShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
