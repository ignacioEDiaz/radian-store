import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { Layout } from './Layout';
import { StatusPage } from '../features/system/StatusPage';
import { PlaceholderHome } from './PlaceholderHome';
import { LoginPage } from '../features/account/pages/LoginPage';
import { RegisterPage } from '../features/account/pages/RegisterPage';
import { AccountPage } from '../features/account/pages/AccountPage';
import { RequireAuth } from '../features/account/components/guards';
import { AdminLayout } from '../features/admin-catalog/pages/AdminLayout';
import { ProductsListPage } from '../features/admin-catalog/pages/ProductsListPage';
import { ProductEditorPage } from '../features/admin-catalog/pages/ProductEditorPage';
import { CollectionsPage } from '../features/admin-catalog/pages/CollectionsPage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <PlaceholderHome /> },
      { path: 'estado', element: <StatusPage /> },
      { path: 'cuenta/ingresar', element: <LoginPage /> },
      { path: 'cuenta/registro', element: <RegisterPage /> },
      {
        path: 'cuenta',
        element: (
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        ),
        children: [{ index: true, element: <AccountPage /> }],
      },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/productos" replace /> },
          { path: 'productos', element: <ProductsListPage /> },
          { path: 'productos/:id', element: <ProductEditorPage /> },
          { path: 'colecciones', element: <CollectionsPage /> },
        ],
      },
    ],
  },
]);
