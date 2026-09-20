import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, ChevronRight, ChevronLeft, MoreVertical, Pencil, Trash2, Moon, Sun, Search, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { SeriesDialog } from '@/features/series/components/SeriesDialog';
import { EpisodeDialog } from '@/features/series/components/EpisodeDialog';
import { ConfirmDeleteDialog } from '@/features/series/components/ConfirmDeleteDialog';
import {
  useAllSeries,
  useCreateSeries,
  useUpdateSeries,
  useDeleteSeries,
  useCreateEpisode,
  useDeleteEpisode,
} from '@/features/series/hooks/use-series';
import type { SeriesFormValues, EpisodeFormValues } from '@/features/series/schemas/series.schema';
import type { SeriesSummary, EpisodeSummary } from '@fire-stick/types';

export function Sidebar({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const { data: seriesList } = useAllSeries();
  const navigate = useNavigate();
  const location = useLocation();
  const activeEpisodeId = location.pathname.startsWith('/series/')
    ? location.pathname.slice('/series/'.length)
    : null;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Distinct categories for the tab selector.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of seriesList ?? []) if (s.category) set.add(s.category);
    return ['All', ...Array.from(set).sort()];
  }, [seriesList]);

  // Prefix ("starts with") match on the series title, filtered by the active tab.
  const q = query.trim().toLowerCase();
  const visibleSeries = useMemo(
    () =>
      (seriesList ?? []).filter(
        (s) =>
          (activeCategory === 'All' || s.category === activeCategory) &&
          (!q || s.title.toLowerCase().startsWith(q)),
      ),
    [seriesList, q, activeCategory],
  );

  // Keep the series that owns the active episode expanded.
  useEffect(() => {
    if (!activeEpisodeId || !seriesList) return;
    const owner = seriesList.find((s) => s.episodes.some((e) => e.id === activeEpisodeId));
    if (owner) setExpanded((prev) => new Set(prev).add(owner.id));
  }, [activeEpisodeId, seriesList]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Dialog state ──────────────────────────────────────────────
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<SeriesSummary | null>(null);
  const [deleteSeriesTarget, setDeleteSeriesTarget] = useState<SeriesSummary | null>(null);
  const [episodeDialogSeriesId, setEpisodeDialogSeriesId] = useState<string | null>(null);
  const [deleteEpisodeTarget, setDeleteEpisodeTarget] =
    useState<{ episode: EpisodeSummary; seriesId: string } | null>(null);

  const epSeriesId = episodeDialogSeriesId ?? deleteEpisodeTarget?.seriesId ?? '';

  const createSeries = useCreateSeries();
  const updateSeries = useUpdateSeries();
  const destroySeries = useDeleteSeries();
  const createEpisode = useCreateEpisode(epSeriesId);
  const destroyEpisode = useDeleteEpisode(epSeriesId);

  function handleSeriesSubmit(values: SeriesFormValues) {
    if (editingSeries) {
      updateSeries.mutate(
        { id: editingSeries.id, payload: values },
        { onSuccess: () => { setSeriesDialogOpen(false); setEditingSeries(null); } },
      );
    } else {
      createSeries.mutate(values, {
        onSuccess: (created) => {
          setSeriesDialogOpen(false);
          if (created?.id) setExpanded((prev) => new Set(prev).add(created.id));
        },
      });
    }
  }

  function handleEpisodeSubmit(values: EpisodeFormValues) {
    const series = seriesList?.find((s) => s.id === episodeDialogSeriesId);
    if (!series) return;
    const nextNumber = series.episodes.reduce((max, e) => Math.max(max, e.number), 0) + 1;
    createEpisode.mutate(
      { title: values.title, number: nextNumber },
      { onSuccess: () => setEpisodeDialogSeriesId(null) },
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
      {/* Brand — same mark as the Fire TV app (ember gradient square + wordmark) */}
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <div className="h-6 w-6 rounded-[6px] bg-[linear-gradient(135deg,hsl(var(--amber)),hsl(var(--primary)))]" />
        <span className="text-base font-extrabold tracking-tight">Firexp</span>
        <span className="ml-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">CMS</span>
      </div>

      {/* Series section */}
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Series
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1.5 px-1.5 text-xs"
          onClick={() => { setEditingSeries(null); setSeriesDialogOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search series…"
            className="h-8 pl-7 pr-7 text-xs"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {!seriesList?.length ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No series yet.</p>
        ) : visibleSeries.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No series start with “{query}”.
          </p>
        ) : (
          visibleSeries.map((series) => (
            <SeriesItem
              key={series.id}
              series={series}
              open={expanded.has(series.id)}
              activeEpisodeId={activeEpisodeId}
              onToggle={() => toggle(series.id)}
              onAddEpisode={() => setEpisodeDialogSeriesId(series.id)}
              onEditSeries={() => { setEditingSeries(series); setSeriesDialogOpen(true); }}
              onDeleteSeries={() => setDeleteSeriesTarget(series)}
              onDeleteEpisode={(ep) => setDeleteEpisodeTarget({ episode: ep, seriesId: series.id })}
            />
          ))
        )}
      </nav>

      {/* Footer: theme */}
      <div className="border-t p-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleTheme}
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {dark ? 'Light mode' : 'Dark mode'}
        </Button>
      </div>

      {/* Dialogs */}
      <SeriesDialog
        open={seriesDialogOpen}
        onOpenChange={setSeriesDialogOpen}
        editing={editingSeries}
        onSubmit={handleSeriesSubmit}
        isPending={createSeries.isPending || updateSeries.isPending}
      />
      <EpisodeDialog
        open={!!episodeDialogSeriesId}
        onOpenChange={(o) => !o && setEpisodeDialogSeriesId(null)}
        onSubmit={handleEpisodeSubmit}
        isPending={createEpisode.isPending}
      />
      <ConfirmDeleteDialog
        open={!!deleteSeriesTarget}
        onOpenChange={(o) => !o && setDeleteSeriesTarget(null)}
        title="Delete series"
        description={`Delete "${deleteSeriesTarget?.title}" and its episodes? This cannot be undone.`}
        isPending={destroySeries.isPending}
        onConfirm={() => {
          if (!deleteSeriesTarget) return;
          const affectsActive = deleteSeriesTarget.episodes.some((e) => e.id === activeEpisodeId);
          destroySeries.mutate(deleteSeriesTarget.id, {
            onSuccess: () => {
              if (affectsActive) navigate('/series');
              setDeleteSeriesTarget(null);
            },
          });
        }}
      />
      <ConfirmDeleteDialog
        open={!!deleteEpisodeTarget}
        onOpenChange={(o) => !o && setDeleteEpisodeTarget(null)}
        title="Delete episode"
        description={`Delete episode "${deleteEpisodeTarget?.episode.title}"?`}
        isPending={destroyEpisode.isPending}
        onConfirm={() => {
          if (!deleteEpisodeTarget) return;
          const wasActive = activeEpisodeId === deleteEpisodeTarget.episode.id;
          destroyEpisode.mutate(deleteEpisodeTarget.episode.id, {
            onSuccess: () => {
              if (wasActive) navigate('/series');
              setDeleteEpisodeTarget(null);
            },
          });
        }}
      />
    </aside>
  );
}

// ── One series (accordion) ──────────────────────────────────────

const PAGE_SIZE = 6;

function SeriesItem({
  series,
  open,
  activeEpisodeId,
  onToggle,
  onAddEpisode,
  onEditSeries,
  onDeleteSeries,
  onDeleteEpisode,
}: {
  series: SeriesSummary;
  open: boolean;
  activeEpisodeId: string | null;
  onToggle: () => void;
  onAddEpisode: () => void;
  onEditSeries: () => void;
  onDeleteSeries: () => void;
  onDeleteEpisode: (ep: EpisodeSummary) => void;
}) {
  const isOpen = open;
  const episodes = series.episodes;
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(episodes.length / PAGE_SIZE));
  // Clamp page when the list shrinks (delete / search).
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const start = page * PAGE_SIZE;
  const pageEpisodes = episodes.slice(start, start + PAGE_SIZE);

  return (
    <div className="mb-0.5">
      {/* Series row (click to expand) */}
      <div className="group/series flex items-center rounded-md text-sm text-foreground hover:bg-accent">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left">
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium leading-tight">{series.title}</span>
            {series.category && (
              <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {series.category}
              </span>
            )}
          </span>
          <span className="shrink-0 self-start pt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {series.episodes.length}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover/series:opacity-100">
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddEpisode}>
              <Plus className="mr-2 h-4 w-4" /> Add episode
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEditSeries}>
              <Pencil className="mr-2 h-4 w-4" /> Edit series
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDeleteSeries}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete series
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Episodes */}
      {isOpen && (
        <div className="ml-3 border-l pl-1">
          {pageEpisodes.map((ep) => (
            <div key={ep.id} className="group/ep flex items-center">
              <NavLink
                to={`/series/${ep.id}`}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-medium tabular-nums',
                    ep.id === activeEpisodeId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {ep.number}
                </span>
                <span className="min-w-0 flex-1 truncate">{ep.title}</span>
              </NavLink>
              <button
                onClick={() => onDeleteEpisode(ep)}
                title="Delete episode"
                className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover/ep:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {episodes.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground/60">No episodes</p>
          )}

          {/* Pager */}
          {pageCount > 1 && (
            <div className="mt-0.5 flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="grid h-5 w-5 place-items-center rounded hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                title="Previous"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="tabular-nums">{page + 1} / {pageCount}</span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="grid h-5 w-5 place-items-center rounded hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                title="Next"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Add-episode row — same size as an episode row */}
          <button
            onClick={onAddEpisode}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-dashed">
              <Plus className="h-3 w-3" />
            </span>
            <span>Add episode</span>
          </button>
        </div>
      )}
    </div>
  );
}
