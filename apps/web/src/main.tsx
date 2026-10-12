import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionPrefProvider } from '@/lib/useReducedMotion';
import App from './App';
import './styles/globals.css';
import './motion-kit/motion-kit.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionPrefProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionPrefProvider>
    </QueryClientProvider>
  </StrictMode>
);
