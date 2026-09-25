import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { ApiError } from '@/lib/api';
import { router } from '@/router';
import { SessionProvider } from '@/features/session/session';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // A 4xx will not succeed on retry; retrying only delays the message.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: '!rounded-xl !border-line !bg-surface !text-ink !font-sans !shadow-float',
          }}
        />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
