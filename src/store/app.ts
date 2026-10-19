import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Period } from '@/lib/history';
import type { ShareSpec } from '@/lib/share';
import type { Track } from '@/lib/history';
import { uid } from '@/lib/format';

export type Appearance = 'dark' | 'light' | 'system';

/** Preferences that survive reloads. */
interface Prefs {
  appearance: Appearance;
  glass: number; // 0 = clear … 100 = tinted (iOS 27 Liquid Glass slider)
  setAppearance: (a: Appearance) => void;
  setGlass: (g: number) => void;
}
export const usePrefs = create<Prefs>()(persist((set) => ({
  appearance: 'dark', glass: 45,
  setAppearance: (appearance) => set({ appearance }),
  setGlass: (glass) => set({ glass }),
}), { name: 'encore.prefs' }));

export interface Story { slides: { node: React.ReactNode; share: ShareSpec; bg: number }[] }
interface Toast { id: string; msg: string; kind?: 'ok' | 'err' }

/** Session state shared across pages. */
interface AppState {
  historyVersion: number; bumpHistory: () => void;
  spotifyVersion: number; bumpSpotify: () => void;
  ambient: string; setAmbient: (u: string) => void;
  period: Period | null; setPeriod: (p: Period) => void;
  chartsTab: 'top' | 'habits' | 'evolution' | 'skips'; setChartsTab: (t: AppState['chartsTab']) => void;
  metric: 'plays' | 'ms'; setMetric: (m: 'plays' | 'ms') => void;
  topSource: 'history' | 'live'; setTopSource: (s: 'history' | 'live') => void;
  liveRange: string; setLiveRange: (r: string) => void;
  toasts: Toast[]; toast: (msg: string, kind?: Toast['kind']) => void; dropToast: (id: string) => void;
  share: ShareSpec | null; openShare: (s: ShareSpec | null) => void;
  story: Story | null; openStory: (s: Story | null) => void;
  saveTracks: { tracks: Track[]; name: string } | null; openSave: (s: { tracks: Track[]; name: string } | null) => void;
  generator: { template?: string; artists?: string[] } | null; openGenerator: (g: { template?: string; artists?: string[] } | null) => void;
}
export const useApp = create<AppState>((set, get) => ({
  historyVersion: 0, bumpHistory: () => set({ historyVersion: get().historyVersion + 1 }),
  spotifyVersion: 0, bumpSpotify: () => set({ spotifyVersion: get().spotifyVersion + 1 }),
  ambient: '', setAmbient: (ambient) => { if (ambient !== get().ambient) set({ ambient }); },
  period: null, setPeriod: (period) => set({ period }),
  chartsTab: 'top', setChartsTab: (chartsTab) => set({ chartsTab }),
  metric: 'plays', setMetric: (metric) => set({ metric }),
  topSource: 'history', setTopSource: (topSource) => set({ topSource }),
  liveRange: 'short_term', setLiveRange: (liveRange) => set({ liveRange }),
  toasts: [],
  toast: (msg, kind) => { const id = uid(); set({ toasts: [...get().toasts, { id, msg, kind }] }); setTimeout(() => get().dropToast(id), kind === 'err' ? 6000 : 3200); },
  dropToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  share: null, openShare: (share) => set({ share }),
  story: null, openStory: (story) => set({ story }),
  saveTracks: null, openSave: (saveTracks) => set({ saveTracks }),
  generator: null, openGenerator: (generator) => set({ generator }),
}));
export const toast = (msg: string, kind?: 'ok' | 'err') => useApp.getState().toast(msg, kind);
