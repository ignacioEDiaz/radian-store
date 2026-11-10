import { createBrowserRouter, Outlet } from 'react-router';
import { Layout } from './Layout';
import { StatusPage } from '../features/system/StatusPage';
import { PlaceholderHome } from './PlaceholderHome';
import { LoginPage } from '../features/account/pages/LoginPage';
import { RegisterPage } from '../features/account/pages/RegisterPage';
import { AccountPage } from '../features/account/pages/AccountPage';
import { RequireAdmin, RequireAuth } from '../features/account/components/guards';

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
        element: (
          <RequireAdmin>
            <Outlet />
          </RequireAdmin>
        ),
        children: [{ index: true, element: <p className="container">Panel de administración</p> }],
      },
    ],
  },
]);
