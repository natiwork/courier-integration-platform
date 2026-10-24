import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './components/AppLayout/AppLayout';
import { CouriersPage } from './pages/CouriersPage';
import { CreateShipmentPage } from './pages/CreateShipmentPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrderDetailsPage } from './pages/OrderDetailsPage';
import { OverviewPage } from './pages/OverviewPage';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { ShipmentsPage } from './pages/ShipmentsPage';

// The component preview is loaded lazily and only in development,
// so it never ends up in the production bundle.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'styleguide',
        lazy: async () => ({ Component: (await import('./pages/StyleguidePage')).StyleguidePage }),
      },
    ]
  : [];

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'shipments', element: <ShipmentsPage /> },
      // "new" is matched before ":orderId", so it never gets treated as an id.
      { path: 'shipments/new', element: <CreateShipmentPage /> },
      { path: 'shipments/:orderId', element: <OrderDetailsPage /> },
      { path: 'couriers', element: <CouriersPage /> },
      { path: 'integrations', element: <IntegrationsPage /> },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
