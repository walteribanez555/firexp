import { useState } from 'react';
import { Play, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Flags, StoryChapter } from '@fire-stick/types';
import { selectVariant } from '@fire-stick/story-graph';

interface Props {
  initialFlags: Flags;
  chapters: StoryChapter[];
  onHighlight: (chapterIds: string[]) => void;
}

/**
 * Walk the chapter list under `flags` using the shared engine's `selectVariant`
 * (from @fire-stick/story-graph) — the single source of truth shared with the
 * relay and the Kotlin TV app.  Returns the ids of chapters whose selected
 * variant is non-null (i.e. would play).
 */
function simulatePath(chapters: StoryChapter[], flags: Flags): string[] {
  return chapters
    .filter((ch) => selectVariant(ch, flags) !== null)
    .map((ch) => ch.id);
}

export function SimulatePanel({ initialFlags, chapters, onHighlight }: Props) {
  const [flags, setFlags] = useState<Flags>({ ...initialFlags });
  const [flagKey, setFlagKey] = useState('');
  const [flagVal, setFlagVal] = useState('0');
  const [result, setResult] = useState<string[]>([]);

  function addFlag() {
    if (!flagKey.trim()) return;
    setFlags((f) => ({ ...f, [flagKey.trim()]: Number(flagVal) }));
    setFlagKey('');
    setFlagVal('0');
  }

  function removeFlag(k: string) {
    setFlags((f) => {
      const next = { ...f };
      delete next[k];
      return next;
    });
  }

  function run() {
    const path = simulatePath(chapters, flags);
    setResult(path);
    onHighlight(path);
  }

  function reset() {
    setFlags({ ...initialFlags });
    setResult([]);
    onHighlight([]);
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Simulate Flags</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(flags).map(([k, v]) => (
            <Badge
              key={k}
              variant="secondary"
              className="gap-1 cursor-pointer text-xs"
              onClick={() => removeFlag(k)}
            >
              {k}={v} <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            className="flex-1 h-7 text-xs"
            placeholder="flag"
            value={flagKey}
            onChange={(e) => setFlagKey(e.target.value)}
          />
          <Input
            className="w-14 h-7 text-xs"
            type="number"
            value={flagVal}
            onChange={(e) => setFlagVal(e.target.value)}
          />
          <Button size="sm" className="h-7" onClick={addFlag}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 flex-1" onClick={run}>
          <Play className="h-3 w-3 mr-1" /> Run
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={reset}>
          Reset
        </Button>
      </div>
      {result.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Path played:</Label>
          <div className="space-y-1">
            {result.map((chId, i) => {
              const ch = chapters.find((c) => c.id === chId);
              return (
                <div key={chId} className="text-xs flex items-center gap-1">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="text-amber">{ch?.title ?? chId}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
