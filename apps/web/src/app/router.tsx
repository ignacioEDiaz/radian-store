import { createBrowserRouter, Navigate, Outlet, useParams, useSearchParams } from 'react-router';
import { AppPage, HomeDocument, Layout } from './Layout';
import { StatusPage } from '../features/system/StatusPage';
import { CollectionPage } from '../features/catalog/pages/CollectionPage';
import { ProductPage } from '../features/catalog/pages/ProductPage';
import { NotFoundPage } from '../features/catalog/pages/NotFoundPage';
import { InfoPage } from '../features/catalog/pages/InfoPage';
import { CartPage } from '../features/cart/CartPage';
import { CheckoutPage } from '../features/checkout/CheckoutPage';
import { OrderConfirmationPage } from '../features/checkout/OrderConfirmationPage';
import { OrdersPage } from '../features/orders/OrdersPage';
import { OrderDetailPage } from '../features/orders/OrderDetailPage';
import { AdminOrderDetailPage, AdminOrdersPage } from '../features/orders/AdminOrdersPages';
import { LoginPage } from '../features/account/pages/LoginPage';
import { RegisterPage } from '../features/account/pages/RegisterPage';
import { AccountPage } from '../features/account/pages/AccountPage';
import { RequireAuth } from '../features/account/components/guards';
import { AdminLayout } from '../features/admin-catalog/pages/AdminLayout';
import { ProductsListPage } from '../features/admin-catalog/pages/ProductsListPage';
import { ProductEditorPage } from '../features/admin-catalog/pages/ProductEditorPage';
import { CollectionsPage } from '../features/admin-catalog/pages/CollectionsPage';

/** Redirección que conserva el parámetro de la ruta y la query (links viejos en español). */
function Legacy({ to }: { to: (param: string) => string }) {
  const params = useParams();
  const [search] = useSearchParams();
  const query = search.toString();
  return <Navigate to={`${to(params['slug'] ?? '')}${query ? `?${query}` : ''}`} replace />;
}

/**
 * Las rutas del catálogo usan las mismas URLs que los links del tema original
 * (`/collections/…`, `/products/…`, `/search`), así el header, los menús y la home enlazan
 * a estas pantallas sin modificar su markup.
 */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomeDocument /> },

      // Catálogo: markup del tema, sin contenedor propio.
      { path: 'collections', element: <Navigate to="/collections/all" replace /> },
      { path: 'collections/:slug', element: <CollectionPage /> },
      { path: 'search', element: <CollectionPage mode="search" /> },
      { path: 'products/:slug', element: <ProductPage /> },

      // Contenido editorial del tema.
      { path: 'pages/*', element: <InfoPage /> },
      { path: 'blogs/*', element: <InfoPage /> },
      { path: 'policies/*', element: <InfoPage /> },

      {
        element: <AppPage />,
        children: [
          { path: 'cart', element: <CartPage /> },
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'pedidos/:number', element: <OrderConfirmationPage /> },
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
            children: [
              { index: true, element: <AccountPage /> },
              { path: 'pedidos', element: <OrdersPage /> },
              { path: 'pedidos/:number', element: <OrderDetailPage /> },
            ],
          },
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to="/admin/productos" replace /> },
              { path: 'productos', element: <ProductsListPage /> },
              { path: 'productos/:id', element: <ProductEditorPage /> },
              { path: 'colecciones', element: <CollectionsPage /> },
              { path: 'pedidos', element: <AdminOrdersPage /> },
              { path: 'pedidos/:number', element: <AdminOrderDetailPage /> },
            ],
          },
        ],
      },

      // Links anteriores (rutas en español) → URLs del tema.
      { path: 'tienda', element: <Legacy to={() => '/collections/all'} /> },
      { path: 'buscar', element: <Legacy to={() => '/search'} /> },
      { path: 'colecciones/:slug', element: <Legacy to={(slug) => `/collections/${slug}`} /> },
      { path: 'productos/:slug', element: <Legacy to={(slug) => `/products/${slug}`} /> },
      { path: 'account/*', element: <Navigate to="/cuenta" replace /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
