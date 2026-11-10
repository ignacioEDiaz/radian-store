import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { StatusPage } from '../features/system/StatusPage';
import { PlaceholderHome } from './PlaceholderHome';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <PlaceholderHome /> },
      { path: 'estado', element: <StatusPage /> },
    ],
  },
]);
