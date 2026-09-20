import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './Layout';
import { SeriesRoute } from '@/features/series/routes';
import { FlowRoute } from '@/features/flow/routes';
import { UploadsRoute } from '@/features/uploads/routes';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/series" replace /> },
      { path: 'series', element: <SeriesRoute /> },
      { path: 'uploads', element: <UploadsRoute /> },
    ],
  },
  {
    path: '/flow/:episodeId',
    element: <FlowRoute />,
  },
]);
