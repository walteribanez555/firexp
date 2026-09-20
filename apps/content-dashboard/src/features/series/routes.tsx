import { useParams } from 'react-router-dom';
import { GitBranch, FilmIcon } from 'lucide-react';
import { useAllSeries } from './hooks/use-series';
import { FlowEditor } from '../flow/routes';

/** Detail pane of the workspace — the sidebar drives selection via the URL. */
export function SeriesRoute() {
  const { episodeId } = useParams<{ episodeId?: string }>();
  const { data: seriesList } = useAllSeries();

  if (episodeId) {
    return <FlowEditor key={episodeId} episodeId={episodeId} />;
  }
  return <EmptyDetail hasSeries={!!seriesList?.length} />;
}

function EmptyDetail({ hasSeries }: { hasSeries: boolean }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          {hasSeries ? <GitBranch className="h-6 w-6" /> : <FilmIcon className="h-6 w-6" />}
        </div>
        <p className="text-sm font-medium">
          {hasSeries ? 'Select an episode' : 'Create your first series'}
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          {hasSeries
            ? 'Pick an episode in the sidebar to edit its flow and upload branch videos.'
            : 'Use “New” in the sidebar to add a series and its episodes.'}
        </p>
      </div>
    </div>
  );
}
