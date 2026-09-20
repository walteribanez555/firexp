import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Plus, Edit, Trash2, Film, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SeriesDialog } from './components/SeriesDialog';
import { EpisodeDialog } from './components/EpisodeDialog';
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog';
import { EpisodeDrawer } from './components/EpisodeDrawer';
import {
  useAllSeries,
  useCreateSeries,
  useUpdateSeries,
  useDeleteSeries,
  useCreateEpisode,
  useDeleteEpisode,
} from './hooks/use-series';
import type { SeriesFormValues, EpisodeFormValues } from './schemas/series.schema';
import type { SeriesSummary, EpisodeSummary } from '@fire-stick/types';

export function SeriesRoute() {
  const { data: seriesList, isLoading } = useAllSeries();

  // Series dialogs
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<SeriesSummary | null>(null);
  const [deleteSeries, setDeleteSeries] = useState<SeriesSummary | null>(null);

  // Episode dialogs — tied to selected series.
  // Keep only the id in local state and derive the series from the live query,
  // so the episodes panel re-renders when the cache refreshes after a mutation.
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const selectedSeries = seriesList?.find((s) => s.id === selectedSeriesId) ?? null;
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [deleteEpisode, setDeleteEpisode] = useState<EpisodeSummary | null>(null);
  const [drawerEpisode, setDrawerEpisode] = useState<EpisodeSummary | null>(null);

  const createSeries = useCreateSeries();
  const updateSeries = useUpdateSeries();
  const destroySeries = useDeleteSeries();
  const createEpisode = useCreateEpisode(selectedSeries?.id ?? '');
  const destroyEpisode = useDeleteEpisode(selectedSeries?.id ?? '');

  const seriesColumns: ColumnDef<SeriesSummary>[] = [
    { accessorKey: 'title', header: 'Title' },
    { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => (
      <span className="text-muted-foreground line-clamp-1">{getValue<string>()}</span>
    )},
    {
      accessorKey: 'episodes',
      header: 'Episodes',
      cell: ({ getValue }) => (
        <Badge variant="secondary">{getValue<EpisodeSummary[]>().length}</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedSeriesId(row.original.id);
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditingSeries(row.original);
              setSeriesDialogOpen(true);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setDeleteSeries(row.original)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: seriesList ?? [],
    columns: seriesColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  function handleSeriesSubmit(values: SeriesFormValues) {
    if (editingSeries) {
      updateSeries.mutate(
        { id: editingSeries.id, payload: values },
        { onSuccess: () => { setSeriesDialogOpen(false); setEditingSeries(null); } },
      );
    } else {
      createSeries.mutate(values, {
        onSuccess: () => setSeriesDialogOpen(false),
      });
    }
  }

  function handleEpisodeSubmit(values: EpisodeFormValues) {
    if (!selectedSeries) return;
    // Backend auto-assigns, but send a computed next number for backward-compat.
    const nextNumber =
      selectedSeries.episodes.reduce((max, e) => Math.max(max, e.number), 0) + 1;
    createEpisode.mutate(
      { title: values.title, number: nextNumber },
      { onSuccess: () => setEpisodeDialogOpen(false) },
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Series table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" /> Series
          </CardTitle>
          <Button size="sm" onClick={() => { setEditingSeries(null); setSeriesDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Series
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={selectedSeries?.id === row.original.id ? 'selected' : undefined}
                    className="cursor-pointer"
                    onClick={() => setSelectedSeriesId(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!seriesList?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No series yet. Create one!
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Episodes panel */}
      {selectedSeries && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Episodes — <span className="text-primary">{selectedSeries.title}</span>
            </CardTitle>
            <Button size="sm" onClick={() => setEpisodeDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Episode
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedSeries.episodes.map((ep) => (
                <div
                  key={ep.id}
                  onClick={() => setDrawerEpisode(ep)}
                  className="flex items-center justify-between rounded-md border px-4 py-3 hover:bg-accent cursor-pointer"
                >
                  <span className="font-medium">
                    Ep {ep.number} — {ep.title}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setDrawerEpisode(ep); }}
                    >
                      Details
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteEpisode(ep); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {selectedSeries.episodes.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No episodes yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Episode detail drawer (details + video upload service) */}
      <EpisodeDrawer
        episode={drawerEpisode}
        open={!!drawerEpisode}
        onOpenChange={(o) => !o && setDrawerEpisode(null)}
      />

      {/* Dialogs */}
      <SeriesDialog
        open={seriesDialogOpen}
        onOpenChange={setSeriesDialogOpen}
        editing={editingSeries}
        onSubmit={handleSeriesSubmit}
        isPending={createSeries.isPending || updateSeries.isPending}
      />
      <EpisodeDialog
        open={episodeDialogOpen}
        onOpenChange={setEpisodeDialogOpen}
        onSubmit={handleEpisodeSubmit}
        isPending={createEpisode.isPending}
      />
      <ConfirmDeleteDialog
        open={!!deleteSeries}
        onOpenChange={(o) => !o && setDeleteSeries(null)}
        title="Delete Series"
        description={`Are you sure you want to delete "${deleteSeries?.title}"? This cannot be undone.`}
        isPending={destroySeries.isPending}
        onConfirm={() => {
          if (!deleteSeries) return;
          destroySeries.mutate(deleteSeries.id, {
            onSuccess: () => {
              setDeleteSeries(null);
              if (selectedSeries?.id === deleteSeries.id) setSelectedSeriesId(null);
            },
          });
        }}
      />
      <ConfirmDeleteDialog
        open={!!deleteEpisode}
        onOpenChange={(o) => !o && setDeleteEpisode(null)}
        title="Delete Episode"
        description={`Delete episode "${deleteEpisode?.title}"?`}
        isPending={destroyEpisode.isPending}
        onConfirm={() => {
          if (!deleteEpisode) return;
          destroyEpisode.mutate(deleteEpisode.id, {
            onSuccess: () => setDeleteEpisode(null),
          });
        }}
      />
    </div>
  );
}
