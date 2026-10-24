import { createBrowserRouter } from 'react-router';
import { AppLayout } from './components/AppLayout/AppLayout';
import { CouriersPage } from './pages/CouriersPage';
import { CreateShipmentPage } from './pages/CreateShipmentPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrderDetailsPage } from './pages/OrderDetailsPage';
import { OverviewPage } from './pages/OverviewPage';
import { ShipmentsPage } from './pages/ShipmentsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'shipments', element: <ShipmentsPage /> },
      // "new" is matched before ":orderId", so it never gets treated as an id.
      { path: 'shipments/new', element: <CreateShipmentPage /> },
      { path: 'shipments/:orderId', element: <OrderDetailsPage /> },
      { path: 'couriers', element: <CouriersPage /> },
      { path: 'integrations', element: <IntegrationsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
