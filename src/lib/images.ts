/* Artwork resolver: looks up artist/track images on Spotify once and caches the URLs on this device. */
import { LS } from './storage';
import { Spotify, pickImg, type SpArtist } from './spotify';

const cache: Record<string, string> = LS.get('imgs', {});
export const artistIds: Record<string, string> = LS.get('artistIds', {});
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const keys = Object.keys(cache);
    if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach((k) => delete cache[k]);
    LS.set('imgs', cache); LS.set('artistIds', artistIds);
  }, 800);
}
export type ArtKind = 'artist' | 'track';
export const cachedImage = (kind: ArtKind, key: string) => cache[kind + ':' + key];
export function seedArtist(a: SpArtist | null | undefined) {
  if (!a?.name) return;
  const u = pickImg(a.images, 300); if (u) cache['artist:' + a.name] = u;
  if (a.id) artistIds[a.name] = a.id;
  save();
}

const pending = new Map<string, Promise<string>>();
const queue: (() => void)[] = []; let active = 0;
function run<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((res, rej) => {
    const go = () => { active++; fn().then(res, rej).finally(() => { active--; queue.shift()?.(); }); };
    if (active < 3) go(); else queue.push(go);
  });
}
export function resolveImage(kind: ArtKind, key: string): Promise<string> {
  const ck = kind + ':' + key;
  if (ck in cache) return Promise.resolve(cache[ck]);
  if (!Spotify.connected || !key) return Promise.resolve('');
  const hit = pending.get(ck); if (hit) return hit;
  const p = run(async () => {
    let url = '';
    try {
      if (kind === 'artist') {
        const a = await Spotify.findArtist(key);
        if (a) { url = pickImg(a.images, 300); if (a.id) artistIds[key] = a.id; }
      } else if (key.startsWith('spotify:track:')) {
        const t = await Spotify.track(key.split(':')[2]); url = pickImg(t?.album?.images, 300);
      } else if (key.startsWith('n:')) {
        const [name, artist] = key.slice(2).split('\u0001'); const t = await Spotify.findTrack(name, artist || ''); url = pickImg(t?.album?.images, 300);
      }
      cache[ck] = url; save();
    } catch { /* network/auth issues: try again next time */ }
    return url;
  }).finally(() => pending.delete(ck));
  pending.set(ck, p);
  return p;
}
