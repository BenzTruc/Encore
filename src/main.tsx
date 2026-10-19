import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { Spotify } from '@/lib/spotify';
import { loadHistory, latestPeriod } from '@/lib/history';
import { useApp, toast } from '@/store/app';
import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/layout.css';
import './styles/components.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

async function boot() {
  // Finish a Spotify login if we were just redirected back with ?code=…
  const login = await Spotify.handleRedirect().catch((e: Error) => ({ error: 'Spotify login failed: ' + e.message }));
  if (await loadHistory()) { useApp.getState().setPeriod(latestPeriod('year')); useApp.getState().bumpHistory(); }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter><App /></HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
  if (login?.error) setTimeout(() => toast(login.error!, 'err'), 400);
  if (login && 'ok' in login && login.ok) setTimeout(() => toast('Spotify connected', 'ok'), 400);
}
boot();
