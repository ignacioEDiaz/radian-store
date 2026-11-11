import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { createQueryClient } from './app/queryClient';
import { router } from './app/router';
import { installThemeBridge } from './theme-bridge';
import './styles/app.css';

const queryClient = createQueryClient();
// El marco de la página (header, menús, carrito, footer) es el del tema original.
installThemeBridge(queryClient, { navigate: (path) => void router.navigate(path) });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
