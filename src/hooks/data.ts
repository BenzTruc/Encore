import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/store/app';
import { Spotify } from '@/lib/spotify';
import { H } from '@/lib/history';

/** Re-renders when the imported history changes; returns the engine. */
export function useHistory() {
  useApp((s) => s.historyVersion);
  return H;
}

/** A Spotify request cached by React Query; disabled when not connected. */
export function useSpotify<T>(key: (string | number)[], fn: () => Promise<T>, enabled = true) {
  const v = useApp((s) => s.spotifyVersion);
  return useQuery({ queryKey: ['sp', v, ...key], queryFn: fn, enabled: enabled && Spotify.connected, staleTime: 5 * 60e3, retry: false });
}

/** Width of an element, kept up to date with ResizeObserver (charts render at real pixel size). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Sets the ambient wallpaper image for the current page. */
export function useAmbient(url?: string) {
  const set = useApp((s) => s.setAmbient);
  useEffect(() => { if (url) set(url); }, [url, set]);
}
