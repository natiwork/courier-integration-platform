import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './styles/global.css';
import { StatsProvider } from './context/StatsProvider';
import { router } from './router';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root is missing in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <StatsProvider>
      <RouterProvider router={router} />
    </StatsProvider>
  </StrictMode>,
);
