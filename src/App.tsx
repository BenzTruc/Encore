import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from '@/layout/Shell';
import { Loading } from '@/components/ui';
import { Tooltip } from '@/charts/Charts';
import { GeneratorSheet, SaveSheet, ShareSheet, StoryPlayer, Toasts } from '@/components/Overlays';

// Each page is its own chunk, loaded on first visit.
const Home = lazy(() => import('@/pages/Home'));
const Charts = lazy(() => import('@/pages/Charts'));
const Artists = lazy(() => import('@/pages/Artists').then((m) => ({ default: m.Artists })));
const Artist = lazy(() => import('@/pages/Artists').then((m) => ({ default: m.Artist })));
const Playlists = lazy(() => import('@/pages/Playlists').then((m) => ({ default: m.Playlists })));
const Playlist = lazy(() => import('@/pages/Playlists').then((m) => ({ default: m.Playlist })));
const Discover = lazy(() => import('@/pages/Discover'));
const Wrapped = lazy(() => import('@/pages/Wrapped').then((m) => ({ default: m.Wrapped })));
const Milestones = lazy(() => import('@/pages/Wrapped').then((m) => ({ default: m.Milestones })));
const Settings = lazy(() => import('@/pages/Settings'));

export default function App() {
  const location = useLocation();
  return (
    <>
      <Shell>
        <Suspense fallback={<Loading />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/artist/:name" element={<Artist />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/playlist/:id" element={<Playlist />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/wrapped" element={<Wrapped />} />
            <Route path="/milestones" element={<Milestones />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
      <Tooltip />
      <Toasts />
      <ShareSheet />
      <SaveSheet />
      <GeneratorSheet />
      <StoryPlayer />
    </>
  );
}
