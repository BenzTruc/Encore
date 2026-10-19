/* Spotify Web API client: PKCE login + the 2026 development-mode endpoints. */
import { LS } from './storage';
import { normTitle, sleep, uid } from './format';
import type { Track } from './history';

const SCOPES = [
  'user-read-private', 'user-top-read', 'user-read-recently-played', 'user-library-read',
  'playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-private', 'playlist-modify-public',
].join(' ');
const API = 'https://api.spotify.com/v1';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SpImage { url: string; width?: number; height?: number }
export interface SpArtist { id: string; name: string; images?: SpImage[]; genres?: string[]; external_urls?: { spotify?: string } }
export interface SpTrack { id: string; uri: string; name: string; duration_ms: number; artists: { id: string; name: string }[]; album?: { id: string; name: string; images?: SpImage[]; release_date?: string } }
export interface SpPlaylist { id: string; name: string; description?: string; images?: SpImage[]; owner?: { id: string; display_name?: string }; collaborative?: boolean; public?: boolean; external_urls?: { spotify?: string }; snapshot_id?: string; items?: { total: number }; tracks?: { total: number } }
export interface SpUser { id: string; display_name?: string; images?: SpImage[] }
export interface PlItem extends Track { pos: number; id: string; mainArtist: string; img: string; imgL: string; release: string; duration: number; added: number; local: boolean }
interface Tokens { access_token: string; refresh_token?: string; expires_at: number }
export class SpotifyError extends Error { status?: number; auth?: boolean }

export function pickImg(imgs: SpImage[] | undefined, target = 300) {
  if (!imgs?.length) return '';
  const s = imgs.slice().sort((a, b) => (a.width || 0) - (b.width || 0));
  return (s.find((i) => (i.width || 640) >= target) || s[s.length - 1]).url;
}
function b64url(bytes: Uint8Array) { let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

/* small promise cache shared by the client */
const mem = new Map<string, { at: number; p: Promise<any> }>();
export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = fn(); mem.set(key, { at: Date.now(), p });
  try { return await p; } catch (e) { mem.delete(key); throw e; }
}
export const invalidate = (prefix: string) => { for (const k of [...mem.keys()]) if (k === prefix || k.startsWith(prefix + ':')) mem.delete(k); };
export const clearCache = () => mem.clear();

const authError = (msg: string) => Object.assign(new SpotifyError(msg), { auth: true });

export const Spotify = {
  get clientId(): string { return LS.get('clientId', ''); },
  set clientId(v: string) { LS.set('clientId', v); },
  get tokens(): Tokens | null { return LS.get<Tokens | null>('tokens', null); },
  set tokens(v: Tokens | null) { if (v) LS.set('tokens', v); else LS.del('tokens'); },
  get connected() { return !!this.tokens?.access_token; },
  redirectUri() { return location.origin + location.pathname.replace(/index\.html?$/i, ''); },
  canConnect() { return location.protocol === 'https:' || /^(127\.0\.0\.1|\[::1\])$/.test(location.hostname); },

  async login() {
    if (!this.clientId) throw new Error('Add your Client ID first.');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = uid() + uid();
    LS.set('pkce', { verifier, state, back: location.hash || '#/' });
    const q = new URLSearchParams({ response_type: 'code', client_id: this.clientId, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: this.redirectUri(), state });
    location.assign('https://accounts.spotify.com/authorize?' + q);
  },
  /** Finishes the login when Spotify redirects back with ?code=… */
  async handleRedirect(): Promise<{ ok?: true; error?: string } | null> {
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return null;
    const pk = LS.get<{ verifier?: string; state?: string; back?: string }>('pkce', {}); LS.del('pkce');
    history.replaceState(null, '', location.pathname + (pk.back || '#/'));
    if (q.get('error')) return { error: q.get('error') === 'access_denied' ? 'You cancelled the Spotify login.' : 'Spotify login failed: ' + q.get('error') };
    if (!pk.verifier || q.get('state') !== pk.state) return { error: 'The Spotify login could not be verified. Try connecting again.' };
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code')!, redirect_uri: this.redirectUri(), client_id: this.clientId, code_verifier: pk.verifier });
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: 'Spotify login failed: ' + (j.error_description || j.error || r.status) };
    this.tokens = { ...j, expires_at: Date.now() + (j.expires_in - 60) * 1000 };
    return { ok: true };
  },
  async refresh() {
    const t = this.tokens; if (!t?.refresh_token) throw authError('Your Spotify session ended. Connect again in Settings.');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: this.clientId });
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { this.tokens = null; throw authError('Your Spotify session ended. Connect again in Settings.'); }
    this.tokens = { ...t, ...j, refresh_token: j.refresh_token || t.refresh_token, expires_at: Date.now() + (j.expires_in - 60) * 1000 };
  },
  logout() { this.tokens = null; LS.del('meCache'); clearCache(); },

  async api<T = any>(path: string, { method = 'GET', body, query, retry = 0 }: { method?: string; body?: unknown; query?: Record<string, string | number>; retry?: number } = {}): Promise<T> {
    let t = this.tokens; if (!t) throw authError('Connect Spotify first.');
    if (!t.expires_at || Date.now() > t.expires_at) { await this.refresh(); t = this.tokens!; }
    let url = path.startsWith('http') ? path : API + path;
    if (query) url += (url.includes('?') ? '&' : '?') + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + t.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && retry < 1) { await this.refresh(); return this.api(path, { method, body, query, retry: retry + 1 }); }
    if (r.status === 429 && retry < 3) {
      const j = await r.clone().json().catch(() => null);
      if (j?.error?.reason === 'QUOTA_EXCEEDED') throw new SpotifyError('Spotify’s daily request limit for your developer app was reached. Try again later.');
      await sleep(Math.min(30, parseInt(r.headers.get('Retry-After') || '2', 10) || 2) * 1000);
      return this.api(path, { method, body, query, retry: retry + 1 });
    }
    if (r.status === 204) return null as T;
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = j?.error?.message || r.statusText || 'Request failed';
      const e = new SpotifyError(r.status === 403 ? `Spotify refused this request (${msg}). Check that your account is added under User Management in your Spotify developer app.` : `Spotify: ${msg}`);
      e.status = r.status; throw e;
    }
    return j as T;
  },
  /** Follows `next` links; falls back to limit=10 where development mode caps page size. */
  async pages<T = any>(path: string, { limit = 50, max = 1000, query = {} }: { limit?: number; max?: number; query?: Record<string, string | number> } = {}): Promise<T[]> {
    let page: any;
    try { page = await this.api(path, { query: { ...query, limit } }); }
    catch (e: any) { if (e.status === 400 && limit > 10) { limit = 10; page = await this.api(path, { query: { ...query, limit } }); } else throw e; }
    const out: T[] = [];
    while (page) {
      out.push(...(page.items || []));
      if (out.length >= max || !page.next) break;
      page = await this.api(page.next);
    }
    return out.slice(0, max);
  },

  me(): Promise<SpUser> {
    const c = LS.get<{ me: SpUser; at: number } | null>('meCache', null);
    if (c && Date.now() - c.at < 864e5) return Promise.resolve(c.me);
    return cached('me', 864e5, async () => { const me = await this.api<SpUser>('/me'); LS.set('meCache', { me, at: Date.now() }); return me; });
  },
  top<K extends 'artists' | 'tracks'>(type: K, range = 'short_term', max = 50): Promise<K extends 'artists' ? SpArtist[] : SpTrack[]> {
    return cached(`top:${type}:${range}:${max}`, 15 * 60e3, () => this.pages(`/me/top/${type}`, { query: { time_range: range }, max })) as never;
  },
  recent(): Promise<{ track: SpTrack; played_at: string }[]> { return cached('recent', 60e3, () => this.api('/me/player/recently-played', { query: { limit: 50 } }).then((j: any) => j?.items || [])); },
  playlists(): Promise<SpPlaylist[]> { return cached('playlists', 2 * 60e3, () => this.pages<SpPlaylist>('/me/playlists', { max: 500 }).then((l) => l.filter(Boolean))); },
  playlist(id: string): Promise<SpPlaylist> { return cached('playlist:' + id, 60e3, () => this.api(`/playlists/${id}`, { query: { fields: 'id,name,description,images,owner,collaborative,public,external_urls,snapshot_id' } })); },
  playlistItems(id: string): Promise<PlItem[]> {
    return cached('pl:' + id, 60e3, async () => {
      const raw = await this.pages<any>(`/playlists/${id}/items`, { max: 10000, query: { additional_types: 'track' } });
      return raw.map((x, pos): PlItem | null => {
        const tr = x.item || x.track; if (!tr || !tr.uri) return null;
        const artists = (tr.artists || []).map((a: any) => a.name) as string[];
        return { pos, uri: tr.uri, id: tr.id, name: tr.name, artist: artists.join(', '), mainArtist: artists[0] || '', album: tr.album?.name || '', img: pickImg(tr.album?.images, 64), imgL: pickImg(tr.album?.images, 300), release: tr.album?.release_date || '', duration: tr.duration_ms || 0, added: x.added_at ? Date.parse(x.added_at) / 1000 : 0, local: !!(x.is_local || tr.is_local) };
      }).filter((x): x is PlItem => !!x);
    });
  },
  async createPlaylist(name: string, description = '', isPublic = false): Promise<SpPlaylist> {
    const p = await this.api<SpPlaylist>('/me/playlists', { method: 'POST', body: { name, description, public: isPublic } });
    invalidate('playlists'); return p;
  },
  async addItems(id: string, uris: string[]) {
    uris = uris.filter((u) => u?.startsWith('spotify:track:'));
    for (let i = 0; i < uris.length; i += 100) await this.api(`/playlists/${id}/items`, { method: 'POST', body: { uris: uris.slice(i, i + 100) } });
    invalidate('pl:' + id); invalidate('playlists');
  },
  async replaceItems(id: string, uris: string[]) {
    uris = uris.filter((u) => u?.startsWith('spotify:track:'));
    await this.api(`/playlists/${id}/items`, { method: 'PUT', body: { uris: uris.slice(0, 100) } });
    for (let i = 100; i < uris.length; i += 100) await this.api(`/playlists/${id}/items`, { method: 'POST', body: { uris: uris.slice(i, i + 100) } });
    invalidate('pl:' + id); invalidate('playlists');
  },
  async removeItems(id: string, uris: string[], snapshot?: string) {
    const u = [...new Set(uris)];
    for (let i = 0; i < u.length; i += 100) await this.api(`/playlists/${id}/items`, { method: 'DELETE', body: { items: u.slice(i, i + 100).map((uri) => ({ uri })), ...(snapshot ? { snapshot_id: snapshot } : {}) } });
    invalidate('pl:' + id); invalidate('playlists');
  },
  artist(id: string): Promise<SpArtist> { return cached('artist:' + id, 864e5, () => this.api('/artists/' + id)); },
  artistAlbums(id: string, max = 40): Promise<any[]> { return cached('albums:' + id, 6 * 3600e3, () => this.pages(`/artists/${id}/albums`, { limit: 10, max, query: { include_groups: 'album,single' } })); },
  albumTracks(id: string): Promise<any[]> { return cached('atracks:' + id, 864e5, () => this.pages(`/albums/${id}/tracks`, { limit: 50, max: 200 })); },
  track(id: string): Promise<SpTrack> { return cached('track:' + id, 864e5 * 7, () => this.api('/tracks/' + id)); },
  async search(q: string, type: 'track' | 'artist' = 'track', limit = 5): Promise<any[]> { const j = await this.api('/search', { query: { q, type, limit: Math.min(10, limit) } }); return j?.[type + 's']?.items || []; },
  findArtist(name: string): Promise<SpArtist | null> {
    return cached('fa:' + name.toLowerCase(), 864e5 * 7, async () => {
      const res: SpArtist[] = await this.search(`artist:"${name.replace(/"/g, '')}"`, 'artist', 5).catch(() => []);
      return res.find((a) => a.name.toLowerCase() === name.toLowerCase()) || res[0] || null;
    });
  },
  findTrack(name: string, artist: string): Promise<SpTrack | null> {
    return cached('ft:' + (name + '|' + artist).toLowerCase(), 864e5 * 7, async () => {
      const res = await this.search(`track:"${name.replace(/"/g, '')}" artist:"${artist.replace(/"/g, '')}"`, 'track', 3).catch(() => []);
      return res[0] || (await this.search(`${name} ${artist}`, 'track', 3).catch(() => []))[0] || null;
    });
  },
};

export function liveTrack(tr: SpTrack): Track & { img: string; mainArtist: string; duration: number } {
  return { name: tr.name, artist: (tr.artists || []).map((a) => a.name).join(', '), mainArtist: tr.artists?.[0]?.name || '', album: tr.album?.name || '', uri: tr.uri, img: pickImg(tr.album?.images, 300), duration: tr.duration_ms };
}

/** Resolve Spotify URIs (searching by title + artist when a track has none), then create the playlist. */
export async function savePlaylist({ name, description = '', tracks, isPublic = false, onProgress }: { name: string; description?: string; tracks: Track[]; isPublic?: boolean; onProgress?: (msg: string, p: number) => void }) {
  const uris: string[] = []; let k = 0;
  for (const t of tracks) {
    k++;
    if (t.uri?.startsWith('spotify:track:')) { uris.push(t.uri); continue; }
    onProgress?.(`Finding “${t.name}” on Spotify`, k / tracks.length);
    const f = await Spotify.findTrack(t.name, t.mainArtist || t.artist).catch(() => null);
    if (f?.uri) uris.push(f.uri);
  }
  const unique = [...new Set(uris)];
  if (!unique.length) throw new Error('None of these songs could be found on Spotify.');
  onProgress?.('Creating the playlist', 0.92);
  const p = await Spotify.createPlaylist(name, description, isPublic);
  await Spotify.addItems(p.id, unique);
  return { playlist: p, count: unique.length };
}

/* ---- Deep cuts: album tracks by an artist that you have never played ---- */
export interface PlayedSets { uris: Set<string>; names: Set<string> }
export async function deepCuts(name: string, artistId: string | undefined, sets: PlayedSets, { maxAlbums = 6, max = 30 } = {}): Promise<Track[]> {
  const id = artistId || (await Spotify.findArtist(name))?.id;
  if (!id) return [];
  const albums = (await Spotify.artistAlbums(id, 40)).filter((al) => al.album_type !== 'compilation');
  albums.sort((x, y) => (x.album_type === y.album_type ? (y.release_date || '').localeCompare(x.release_date || '') : x.album_type === 'album' ? -1 : 1));
  const out: Track[] = []; const seen = new Set<string>();
  for (const al of albums.slice(0, maxAlbums)) {
    const tracks = await Spotify.albumTracks(al.id).catch(() => []);
    for (const t of tracks) {
      if (!t.artists?.some((x: any) => x.id === id)) continue;
      const nt = normTitle(t.name);
      if (sets.uris.has(t.uri) || sets.names.has(nt + '|' + name.toLowerCase()) || seen.has(nt)) continue;
      seen.add(nt);
      out.push({ name: t.name, artist: (t.artists || []).map((x: any) => x.name).join(', '), mainArtist: name, album: al.name, uri: t.uri, img: pickImg(al.images, 300), duration: t.duration_ms, release: al.release_date });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/* ---- Last.fm ---- */
export const LastFm = {
  get key(): string { return LS.get('lastfmKey', ''); },
  set key(v: string) { LS.set('lastfmKey', v); },
  async call(method: string, params: Record<string, string | number>) {
    if (!this.key) throw new Error('Add a Last.fm API key in Settings.');
    const q = new URLSearchParams({ method, api_key: this.key, format: 'json', autocorrect: '1', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const r = await fetch('https://ws.audioscrobbler.com/2.0/?' + q);
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.error) throw new Error('Last.fm: ' + (j?.message || r.status));
    return j;
  },
  similar(artist: string, limit = 25): Promise<{ name: string; match: number }[]> {
    return cached('lfm:sim:' + artist.toLowerCase(), 864e5, () => this.call('artist.getsimilar', { artist, limit }).then((j: any) => (j?.similarartists?.artist || []).map((a: any) => ({ name: a.name, match: +a.match || 0 }))));
  },
  topTracks(artist: string, limit = 5): Promise<{ name: string; artist: string }[]> {
    return cached('lfm:top:' + artist.toLowerCase(), 864e5, () => this.call('artist.gettoptracks', { artist, limit }).then((j: any) => (j?.toptracks?.track || []).map((t: any) => ({ name: t.name, artist: t.artist?.name || artist }))));
  },
};
