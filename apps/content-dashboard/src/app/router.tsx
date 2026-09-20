import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './Layout';
import { SeriesRoute } from '@/features/series/routes';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/series" replace /> },
      { path: 'series', element: <SeriesRoute /> },
      { path: 'series/:episodeId', element: <SeriesRoute /> },
    ],
  },
]);
