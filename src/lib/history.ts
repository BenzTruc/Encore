/* Listening history: import (Spotify .zip / .json) + analysis engine.
   Data is kept in compact typed arrays so lifetime histories (500k+ streams) stay fast. */
import { IDB } from './storage';
import { MONTHS_LONG, fmtDate, fmtHours, fmtLongDur, fmtN, normTitle, sleep } from './format';

export const PLAY_MS = 30000; // Spotify counts a stream after 30 seconds
const F_SKIP = 1, F_SHUF = 2, F_OFF = 4, F_DONE = 8;
export const PLATFORMS = ['iPhone & iPad', 'Android', 'Mac', 'Windows', 'Web player', 'Speakers & TV', 'Linux', 'Other'];
const END = 2 ** 32 - 1;

function platformOf(p: string) {
  p = String(p || '').toLowerCase();
  if (!p) return 7;
  if (p.includes('web_player') || p.includes('webplayer')) return 4;
  if (p.startsWith('ios') || p.includes('iphone') || p.includes('ipad')) return 0;
  if (p.includes('android')) return 1;
  if (p.includes('os x') || p.includes('macos') || p.includes('mac os')) return 2;
  if (p.includes('windows')) return 3;
  if (/partner|sonos|cast|speaker|tv|google|amazon|alexa|echo|playstation|xbox|bose|denon|samsung_|lg_|sony/.test(p)) return 5;
  if (p.includes('linux')) return 6;
  return 7;
}

export interface HistoryMeta { files: string[]; importedAt: number; extended: boolean; basicOnly: boolean }
interface Rec { t: number; ms: number; name: string; artist: string; album: string; uri: string; fl: number; pf: number; ext: boolean }

class HistoryStore {
  loaded = false; n = 0;
  ts = new Uint32Array(0); ms = new Uint32Array(0); tr = new Uint32Array(0); fl = new Uint8Array(0); pf = new Uint8Array(0);
  tName: string[] = []; tArtist: number[] = []; tAlbum: number[] = []; tUri: string[] = [];
  artists: string[] = []; albums: string[] = []; albumArtist: number[] = [];
  meta: HistoryMeta | null = null;
  // derived
  day = new Int32Array(0); hour = new Uint8Array(0); dow = new Uint8Array(0);
  tCount = 0; first = 0; last = 0;
  artistFirst = new Int32Array(0); trackFirst = new Int32Array(0);
  artistIndex = new Map<string, number>();
  cache = new Map<string, Agg>();
}
export const H = new HistoryStore();

/* ---------------- import ---------------- */
async function readZip(file: File) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const out: { name: string; text: string }[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const base = name.split('/').pop() || '';
    if (!/\.json$/i.test(base)) continue;
    if (!/(Streaming_History_Audio|StreamingHistory_music|^StreamingHistory\d|endsong)/i.test(base)) continue;
    out.push({ name: base, text: await entry.async('string') });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRecord(r: any): Rec | null {
  if (!r || typeof r !== 'object') return null;
  if ('ts' in r) {
    const name = r.master_metadata_track_name, artist = r.master_metadata_album_artist_name;
    if (!name || !artist) return null; // podcasts, audiobooks
    const t = Date.parse(r.ts); if (!isFinite(t)) return null;
    const ms = r.ms_played | 0;
    let fl = 0;
    const skipped = r.skipped === true || r.skipped === 1 || (r.skipped !== false && r.reason_end === 'fwdbtn' && ms < PLAY_MS);
    if (skipped) fl |= F_SKIP;
    if (r.shuffle) fl |= F_SHUF;
    if (r.offline) fl |= F_OFF;
    if (r.reason_end === 'trackdone') fl |= F_DONE;
    return { t: Math.floor(t / 1000), ms, name, artist, album: r.master_metadata_album_album_name || '', uri: r.spotify_track_uri || '', fl, pf: platformOf(r.platform), ext: true };
  }
  if ('endTime' in r) {
    const name = r.trackName, artist = r.artistName;
    if (!name || !artist || artist === 'Unknown Artist') return null;
    const t = Date.parse(String(r.endTime).replace(' ', 'T') + ':00Z'); if (!isFinite(t)) return null;
    const ms = r.msPlayed | 0;
    return { t: Math.floor(t / 1000), ms, name, artist, album: '', uri: '', fl: ms < PLAY_MS ? F_SKIP : F_DONE, pf: 7, ext: false };
  }
  return null;
}

export async function importHistoryFiles(files: File[], onProgress: (msg: string, p: number) => void = () => {}) {
  const texts: { name: string; text: string }[] = [];
  let i = 0;
  for (const f of files) {
    onProgress(`Reading ${f.name}`, (i++ / files.length) * 0.4);
    if (/\.zip$/i.test(f.name)) texts.push(...(await readZip(f)));
    else if (/\.json$/i.test(f.name)) texts.push({ name: f.name, text: await f.text() });
  }
  if (!texts.length) throw new Error('No listening history found. Choose the .zip from Spotify or the Streaming_History_Audio .json files inside it.');
  const recs: Rec[] = []; let ext = 0; const skippedFiles: string[] = [];
  for (let k = 0; k < texts.length; k++) {
    onProgress(`Parsing ${texts[k].name}`, 0.4 + (k / texts.length) * 0.4);
    await sleep(0);
    let arr: unknown;
    try { arr = JSON.parse(texts[k].text); } catch { skippedFiles.push(texts[k].name); continue; }
    if (!Array.isArray(arr)) { skippedFiles.push(texts[k].name); continue; }
    for (const r of arr) { const n = normalizeRecord(r); if (n) { recs.push(n); if (n.ext) ext++; } }
  }
  if (!recs.length) throw new Error('These files contain no music streams. Make sure you picked the audio history files.');
  if (H.loaded) for (let j = 0; j < H.n; j++) {
    const ti = H.tr[j];
    recs.push({ t: H.ts[j], ms: H.ms[j], name: H.tName[ti], artist: H.artists[H.tArtist[ti]], album: H.albums[H.tAlbum[ti]] || '', uri: H.tUri[ti] || '', fl: H.fl[j], pf: H.pf[j], ext: true });
  }
  onProgress('Organizing', 0.85); await sleep(0);
  recs.sort((a, b) => a.t - b.t);
  const seen = new Set<string>(); const uniq: Rec[] = [];
  for (const r of recs) { const k = r.t + '|' + r.ms + '|' + r.name + '|' + r.artist; if (seen.has(k)) continue; seen.add(k); uniq.push(r); }
  const prevFiles = H.meta?.files || [];
  buildFromRecords(uniq, { files: [...new Set([...prevFiles, ...texts.map((t) => t.name)])], importedAt: Date.now(), extended: ext > 0 || !!H.meta?.extended, basicOnly: ext === 0 && !H.meta?.extended });
  onProgress('Saving on this device', 0.95);
  await saveHistory();
  return { streams: H.n, skippedFiles };
}

function buildFromRecords(recs: Rec[], meta: HistoryMeta) {
  const tKey = new Map<string, number>(), aKey = new Map<string, number>(), alKey = new Map<string, number>();
  const tName: string[] = [], tArtist: number[] = [], tAlbum: number[] = [], tUri: string[] = [], artists: string[] = [], albums: string[] = [], albumArtist: number[] = [];
  const n = recs.length;
  const ts = new Uint32Array(n), ms = new Uint32Array(n), tr = new Uint32Array(n), fl = new Uint8Array(n), pf = new Uint8Array(n);
  const uriByName = new Map<string, string>();
  for (const r of recs) if (r.uri) uriByName.set(r.name + '\u0001' + r.artist, r.uri);
  for (let i = 0; i < n; i++) {
    const r = recs[i];
    let ai = aKey.get(r.artist); if (ai === undefined) { ai = artists.length; artists.push(r.artist); aKey.set(r.artist, ai); }
    const uri = r.uri || uriByName.get(r.name + '\u0001' + r.artist) || '';
    const k = uri || 'n:' + r.name + '\u0001' + r.artist;
    let ti = tKey.get(k);
    if (ti === undefined) {
      ti = tName.length; tKey.set(k, ti);
      const alk = (r.album || '') + '\u0001' + ai;
      let ali = alKey.get(alk); if (ali === undefined) { ali = albums.length; albums.push(r.album || ''); albumArtist.push(ai); alKey.set(alk, ali); }
      tName.push(r.name); tArtist.push(ai); tAlbum.push(ali); tUri.push(uri);
    } else if (r.album && !albums[tAlbum[ti]]) {
      const alk = r.album + '\u0001' + ai; let ali = alKey.get(alk);
      if (ali === undefined) { ali = albums.length; albums.push(r.album); albumArtist.push(ai); alKey.set(alk, ali); }
      tAlbum[ti] = ali;
    }
    ts[i] = r.t; ms[i] = r.ms; tr[i] = ti; fl[i] = r.fl; pf[i] = r.pf;
  }
  Object.assign(H, { n, ts, ms, tr, fl, pf, tName, tArtist, tAlbum, tUri, artists, albums, albumArtist, meta, loaded: n > 0 });
  derive();
}

function derive() {
  const n = H.n;
  H.day = new Int32Array(n); H.hour = new Uint8Array(n); H.dow = new Uint8Array(n);
  H.tCount = H.tName.length;
  let dayStart = -1, dayEnd = -1, curDay = 0, curDow = 0;
  for (let i = 0; i < n; i++) {
    const t = H.ts[i];
    if (t < dayStart || t >= dayEnd) {
      const d = new Date(t * 1000);
      dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;
      dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() / 1000;
      curDay = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
      curDow = (d.getDay() + 6) % 7;
    }
    H.day[i] = curDay; H.dow[i] = curDow; H.hour[i] = Math.min(23, Math.floor((t - dayStart) / 3600));
  }
  H.cache.clear();
  H.first = n ? H.ts[0] : 0; H.last = n ? H.ts[n - 1] : 0;
  H.artistFirst = new Int32Array(H.artists.length).fill(-1);
  H.trackFirst = new Int32Array(H.tCount).fill(-1);
  for (let i = 0; i < n; i++) {
    if (H.ms[i] < PLAY_MS) continue;
    const ti = H.tr[i], ai = H.tArtist[ti];
    if (H.artistFirst[ai] < 0) H.artistFirst[ai] = i;
    if (H.trackFirst[ti] < 0) H.trackFirst[ti] = i;
  }
  H.artistIndex = new Map(H.artists.map((a, i) => [a, i]));
}

async function saveHistory() {
  await IDB.set('history', { v: 1, n: H.n, ts: H.ts, ms: H.ms, tr: H.tr, fl: H.fl, pf: H.pf, tName: H.tName, tArtist: H.tArtist, tAlbum: H.tAlbum, tUri: H.tUri, artists: H.artists, albums: H.albums, albumArtist: H.albumArtist, meta: H.meta });
}
export async function loadHistory() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = await IDB.get<any>('history');
  if (!d || !d.n) return false;
  Object.assign(H, { n: d.n, ts: d.ts, ms: d.ms, tr: d.tr, fl: d.fl, pf: d.pf, tName: d.tName, tArtist: d.tArtist, tAlbum: d.tAlbum, tUri: d.tUri, artists: d.artists, albums: d.albums, albumArtist: d.albumArtist, meta: d.meta, loaded: true });
  derive();
  return true;
}
export async function clearHistory() {
  Object.assign(H, { loaded: false, n: 0, meta: null, tName: [], artists: [], albums: [], tCount: 0 });
  H.cache.clear();
  await IDB.del('history');
}

/* ---------------- periods ---------------- */
export type Period =
  | { kind: 'all' }
  | { kind: 'year'; y: number }
  | { kind: 'month'; y: number; m: number }
  | { kind: 'week'; y: number; m: number; d: number }
  | { kind: 'range'; a: number; b: number; label?: string };
export type PeriodKind = Period['kind'];

export const sec = (d: Date) => Math.floor(d.getTime() / 1000);
export function periodRange(p: Period): [number, number] {
  switch (p.kind) {
    case 'year': return [sec(new Date(p.y, 0, 1)), sec(new Date(p.y + 1, 0, 1))];
    case 'month': return [sec(new Date(p.y, p.m, 1)), sec(new Date(p.y, p.m + 1, 1))];
    case 'week': return [sec(new Date(p.y, p.m, p.d)), sec(new Date(p.y, p.m, p.d + 7))];
    case 'range': return [p.a, p.b];
    default: return [0, END];
  }
}
export function periodLabel(p: Period) {
  switch (p.kind) {
    case 'all': return 'All time';
    case 'year': return String(p.y);
    case 'month': return `${MONTHS_LONG[p.m]} ${p.y}`;
    case 'week': {
      const a = new Date(p.y, p.m, p.d), b = new Date(p.y, p.m, p.d + 6);
      return `${a.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    case 'range': return p.label || 'Custom';
  }
}
export function latestPeriod(kind: PeriodKind): Period {
  const d = new Date((H.last || Date.now() / 1000) * 1000);
  if (kind === 'year') return { kind, y: d.getFullYear() };
  if (kind === 'month') return { kind, y: d.getFullYear(), m: d.getMonth() };
  if (kind === 'week') { const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); return { kind, y: mon.getFullYear(), m: mon.getMonth(), d: mon.getDate() }; }
  return { kind: 'all' };
}
export function shiftPeriod(p: Period, dir: number): Period {
  if (p.kind === 'year') return { ...p, y: p.y + dir };
  if (p.kind === 'month') { const d = new Date(p.y, p.m + dir, 1); return { ...p, y: d.getFullYear(), m: d.getMonth() }; }
  if (p.kind === 'week') { const d = new Date(p.y, p.m, p.d + 7 * dir); return { ...p, y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; }
  return p;
}
export function periodHasData(p: Period) { if (!H.loaded) return false; const [a, b] = periodRange(p); return b > H.first && a <= H.last; }
export const prevPeriod = (p: Period) => (p.kind === 'all' || p.kind === 'range' ? null : shiftPeriod(p, -1));
export function yearsInData() { if (!H.loaded) return []; const a = new Date(H.first * 1000).getFullYear(), b = new Date(H.last * 1000).getFullYear(); const out: number[] = []; for (let y = b; y >= a; y--) out.push(y); return out; }

function lowerBound(t: number) { let lo = 0, hi = H.n; while (lo < hi) { const m = (lo + hi) >> 1; if (H.ts[m] < t) lo = m + 1; else hi = m; } return lo; }
const idxRange = (a: number, b: number): [number, number] => [lowerBound(a), lowerBound(b)];
export const dayToDate = (d: number) => { const u = new Date(d * 86400000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); };
export const dayToSec = (d: number) => sec(dayToDate(d));

/* ---------------- aggregation ---------------- */
export interface Agg {
  a: number; b: number; i0: number; i1: number; ms: number; plays: number; events: number; skips: number; shuf: number; off: number; days: number;
  trMs: Float64Array; trPlays: Uint32Array; trEv: Uint32Array; trSkip: Uint32Array; trDone: Uint32Array;
  artMs: Float64Array; artPlays: Uint32Array; artEv: Uint32Array; artSkip: Uint32Array; albMs: Float64Array; albPlays: Uint32Array;
  uniqTracks: number; uniqArtists: number; pfMs: Float64Array;
}
export function aggregate(a: number, b: number): Agg {
  const key = a + ':' + b;
  const hit = H.cache.get(key); if (hit) return hit;
  const [i0, i1] = idxRange(a, b);
  const T = H.tCount, A = H.artists.length, AL = H.albums.length;
  const trMs = new Float64Array(T), trPlays = new Uint32Array(T), trEv = new Uint32Array(T), trSkip = new Uint32Array(T), trDone = new Uint32Array(T);
  let ms = 0, plays = 0, events = 0, skips = 0, shuf = 0, off = 0;
  const days = new Set<number>(); const pfMs = new Float64Array(PLATFORMS.length);
  for (let i = i0; i < i1; i++) {
    const ti = H.tr[i], m = H.ms[i], f = H.fl[i];
    trMs[ti] += m; ms += m; trEv[ti]++; events++;
    if (m >= PLAY_MS) { trPlays[ti]++; plays++; days.add(H.day[i]); }
    if (f & F_SKIP) { trSkip[ti]++; skips++; }
    if (f & F_DONE) trDone[ti]++;
    if (f & F_SHUF) shuf++;
    if (f & F_OFF) off++;
    pfMs[H.pf[i]] += m;
  }
  const artMs = new Float64Array(A), artPlays = new Uint32Array(A), artEv = new Uint32Array(A), artSkip = new Uint32Array(A), albMs = new Float64Array(AL), albPlays = new Uint32Array(AL);
  let uniqTracks = 0;
  for (let t = 0; t < T; t++) {
    if (!trEv[t]) continue;
    const ai = H.tArtist[t], al = H.tAlbum[t];
    artMs[ai] += trMs[t]; artPlays[ai] += trPlays[t]; artEv[ai] += trEv[t]; artSkip[ai] += trSkip[t];
    albMs[al] += trMs[t]; albPlays[al] += trPlays[t];
    if (trPlays[t]) uniqTracks++;
  }
  let uniqArtists = 0; for (let x = 0; x < A; x++) if (artPlays[x]) uniqArtists++;
  const res: Agg = { a, b, i0, i1, ms, plays, events, skips, shuf, off, days: days.size, trMs, trPlays, trEv, trSkip, trDone, artMs, artPlays, artEv, artSkip, albMs, albPlays, uniqTracks, uniqArtists, pfMs };
  if (H.cache.size > 40) H.cache.delete(H.cache.keys().next().value!);
  H.cache.set(key, res);
  return res;
}
export const ALL = () => aggregate(0, END);
export function rangeAgg(p: Period) { return aggregate(...periodRange(p)); }

export function topIdx(arr: ArrayLike<number>, n: number, filter?: (i: number) => boolean) {
  const idx: number[] = [];
  for (let i = 0; i < arr.length; i++) if (arr[i] > 0 && (!filter || filter(i))) idx.push(i);
  idx.sort((x, y) => arr[y] - arr[x]);
  return idx.slice(0, n);
}

export interface Track { i?: number; name: string; artist: string; album: string; uri: string; plays?: number; ms?: number; skips?: number; events?: number; img?: string; mainArtist?: string; duration?: number; release?: string; rate?: number; last?: number; count?: number; day?: number }
export interface ArtistStat { i?: number; name: string; plays: number; ms: number; img?: string; sub?: string }

export function trackObj(t: number, agg?: Agg): Track {
  return { i: t, name: H.tName[t], artist: H.artists[H.tArtist[t]], mainArtist: H.artists[H.tArtist[t]], album: H.albums[H.tAlbum[t]] || '', uri: H.tUri[t], plays: agg ? agg.trPlays[t] : 0, ms: agg ? agg.trMs[t] : 0, skips: agg ? agg.trSkip[t] : 0, events: agg ? agg.trEv[t] : 0 };
}
export const artistObj = (x: number, agg?: Agg): ArtistStat => ({ i: x, name: H.artists[x], plays: agg ? agg.artPlays[x] : 0, ms: agg ? agg.artMs[x] : 0 });
export const topTracks = (agg: Agg, n = 50, by: 'plays' | 'ms' = 'plays') => topIdx(by === 'ms' ? agg.trMs : agg.trPlays, n).map((t) => trackObj(t, agg));
export const topArtists = (agg: Agg, n = 50, by: 'plays' | 'ms' = 'plays') => topIdx(by === 'ms' ? agg.artMs : agg.artPlays, n).map((x) => artistObj(x, agg));
export const topAlbums = (agg: Agg, n = 50, by: 'plays' | 'ms' = 'plays') =>
  topIdx(by === 'ms' ? agg.albMs : agg.albPlays, n, (i) => !!H.albums[i]).map((x) => ({ i: x, name: H.albums[x], artist: H.artists[H.albumArtist[x]], plays: agg.albPlays[x], ms: agg.albMs[x], key: firstTrackKeyOfAlbum(x) }));
function firstTrackKeyOfAlbum(al: number) { for (let t = 0; t < H.tCount; t++) if (H.tAlbum[t] === al) return H.tUri[t] || 'n:' + H.tName[t] + '\u0001' + H.artists[H.tArtist[t]]; return ''; }

/** Previous period, cut to the same length when the current one is still in progress. */
export function comparablePrev(p: Period) {
  const pp = prevPeriod(p); if (!pp || !periodHasData(pp)) return null;
  const [a, b] = periodRange(p); const [pa, pb0] = periodRange(pp);
  let pb = pb0; if (b > H.last + 1) pb = Math.min(pb, pa + (H.last + 1 - a));
  if (pa < H.first) return null;
  return aggregate(pa, pb);
}

/* ---------------- time series ---------------- */
export type Bucket = 'day' | 'week' | 'month' | 'year';
export interface BucketVal { start: number; end: number; ms: number; plays: number; date: Date }
export function seriesByBucket(a: number, b: number, bucket: Bucket, filterFn?: (i: number) => boolean): BucketVal[] {
  a = Math.max(a, H.first); b = Math.min(b, H.last + 1);
  if (b <= a) return [];
  const starts: Date[] = []; const d0 = new Date(a * 1000);
  let cur = bucket === 'day' ? new Date(d0.getFullYear(), d0.getMonth(), d0.getDate())
    : bucket === 'week' ? new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - ((d0.getDay() + 6) % 7))
    : bucket === 'month' ? new Date(d0.getFullYear(), d0.getMonth(), 1) : new Date(d0.getFullYear(), 0, 1);
  while (sec(cur) < b && starts.length < 2000) {
    starts.push(cur);
    cur = bucket === 'day' ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
      : bucket === 'week' ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7)
      : bucket === 'month' ? new Date(cur.getFullYear(), cur.getMonth() + 1, 1) : new Date(cur.getFullYear() + 1, 0, 1);
  }
  const edges = starts.map(sec); edges.push(sec(cur));
  const out = starts.map((s, k) => ({ start: edges[k], end: edges[k + 1], ms: 0, plays: 0, date: s }));
  const [i0, i1] = idxRange(a, b);
  let k = 0;
  for (let i = i0; i < i1; i++) {
    while (k < out.length - 1 && H.ts[i] >= edges[k + 1]) k++;
    if (filterFn && !filterFn(i)) continue;
    out[k].ms += H.ms[i]; if (H.ms[i] >= PLAY_MS) out[k].plays++;
  }
  return out;
}

export function habits(a: number, b: number) {
  const [i0, i1] = idxRange(a, b);
  const hours = new Array(24).fill(0) as number[], dow = new Array(7).fill(0) as number[];
  const dowHour = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  const daily = new Map<number, number>();
  for (let i = i0; i < i1; i++) {
    const m = H.ms[i]; hours[H.hour[i]] += m; dowHour[H.dow[i]][H.hour[i]] += m; dow[H.dow[i]] += m;
    daily.set(H.day[i], (daily.get(H.day[i]) || 0) + m);
  }
  return { hours, dowHour, dow, daily };
}
export function streaks(a = 0, b = END) {
  const [i0, i1] = idxRange(a, b);
  const days: number[] = []; let prev: number | null = null;
  for (let i = i0; i < i1; i++) { if (H.ms[i] < PLAY_MS) continue; const d = H.day[i]; if (d !== prev) { days.push(d); prev = d; } }
  let best = { len: 0, s: 0, e: 0 }, cur = { len: 0, s: 0, e: 0 };
  for (let k = 0; k < days.length; k++) {
    if (k && days[k] === days[k - 1] + 1) { cur.len++; cur.e = days[k]; } else cur = { len: 1, s: days[k], e: days[k] };
    if (cur.len > best.len) best = { ...cur };
  }
  return { best, current: cur, activeDays: days.length };
}

export interface Persona { k: string; title: string; text: string; icon: 'moon' | 'sun'; peak: number }
export function personaFromHours(hours: number[]): Persona {
  const tot = hours.reduce((s, v) => s + v, 0) || 1;
  let night = 0; for (let h = 22; h !== 4; h = (h + 1) % 24) night += hours[h];
  night /= tot;
  const peak = hours.indexOf(Math.max(...hours));
  let o: Omit<Persona, 'peak'>;
  if (peak >= 22 || peak < 5) o = { k: 'night', title: 'Night owl', text: 'Your music comes alive after dark.', icon: 'moon' };
  else if (peak < 10) o = { k: 'morning', title: 'Early riser', text: 'You start the day with a soundtrack.', icon: 'sun' };
  else if (peak < 17) o = { k: 'day', title: 'Daytime groover', text: 'Music keeps you company through the day.', icon: 'sun' };
  else o = { k: 'eve', title: 'Evening unwinder', text: 'Your listening peaks as the day winds down.', icon: 'moon' };
  if (o.k !== 'night' && night > 0.3) o = { ...o, text: o.text + ' A lot of it happens late at night, too.' };
  return { ...o, peak };
}

/* ---------------- evolution ---------------- */
export function evolution(a: number, b: number, k = 8, bucket: Bucket = 'month') {
  const agg = aggregate(a, b);
  const top = topIdx(agg.artMs, k);
  const pos = new Map(top.map((x, j) => [x, j]));
  const buckets = seriesByBucket(a, b, bucket);
  if (!buckets.length) return null;
  const edges = buckets.map((x) => x.start); edges.push(buckets[buckets.length - 1].end);
  const vals = top.map(() => new Array(buckets.length).fill(0) as number[]);
  const other = new Array(buckets.length).fill(0) as number[], tot = new Array(buckets.length).fill(0) as number[];
  const [i0, i1] = idxRange(Math.max(a, H.first), Math.min(b, H.last + 1));
  let q = 0;
  for (let i = i0; i < i1; i++) {
    while (q < buckets.length - 1 && H.ts[i] >= edges[q + 1]) q++;
    const ai = H.tArtist[H.tr[i]], m = H.ms[i];
    tot[q] += m; const p = pos.get(ai); if (p === undefined) other[q] += m; else vals[p][q] += m;
  }
  return { buckets, series: top.map((x, j) => ({ name: H.artists[x], i: x, values: vals[j] })), other, totals: tot };
}
export type Evolution = NonNullable<ReturnType<typeof evolution>>;
export function yearlyTop(n = 5) {
  return yearsInData().slice().reverse().map((y) => { const agg = aggregate(...periodRange({ kind: 'year', y })); return { y, artists: topArtists(agg, n, 'ms'), ms: agg.ms }; });
}
export function newArtistsByYear() {
  const m = new Map<number, number>();
  for (let x = 0; x < H.artists.length; x++) { const i = H.artistFirst[x]; if (i < 0) continue; const y = new Date(H.ts[i] * 1000).getFullYear(); m.set(y, (m.get(y) || 0) + 1); }
  return yearsInData().slice().reverse().map((y) => ({ y, n: m.get(y) || 0 }));
}

/* ---------------- skips & loyalty ---------------- */
export function skipStats(agg: Agg) {
  const rows: { t: number; ev: number; sk: number; rate: number }[] = [];
  for (let t = 0; t < H.tCount; t++) if (agg.trEv[t] >= 5) rows.push({ t, ev: agg.trEv[t], sk: agg.trSkip[t], rate: agg.trSkip[t] / agg.trEv[t] });
  const mostSkipped = rows.filter((r) => r.sk >= 3).sort((x, y) => y.rate - x.rate || y.sk - x.sk).slice(0, 25).map((r) => ({ ...trackObj(r.t, agg), rate: r.rate }));
  const alwaysFinish = rows.filter((r) => r.sk === 0 && agg.trPlays[r.t] >= 6).sort((x, y) => agg.trPlays[y.t] - agg.trPlays[x.t]).slice(0, 25).map((r) => ({ ...trackObj(r.t, agg), rate: 0 }));
  const artistRows: (ArtistStat & { rate: number; ev: number })[] = [];
  for (let x = 0; x < H.artists.length; x++) if (agg.artEv[x] >= 25) artistRows.push({ ...artistObj(x, agg), rate: agg.artSkip[x] / agg.artEv[x], ev: agg.artEv[x] });
  return {
    mostSkipped, alwaysFinish,
    artistSkip: artistRows.slice().sort((p, q) => q.rate - p.rate).slice(0, 10),
    artistLoyal: artistRows.slice().sort((p, q) => p.rate - q.rate).slice(0, 10),
    rate: agg.events ? agg.skips / agg.events : 0,
  };
}
export function replayStats(a: number, b: number, n = 15) {
  const [i0, i1] = idxRange(a, b);
  const best = new Map<number, { c: number; day: number }>(); let curDay = -1; let counts = new Map<number, number>();
  const flush = () => { for (const [t, c] of counts) { const prev = best.get(t); if (!prev || c > prev.c) best.set(t, { c, day: curDay }); } counts = new Map(); };
  for (let i = i0; i < i1; i++) { if (H.ms[i] < PLAY_MS) continue; if (H.day[i] !== curDay) { flush(); curDay = H.day[i]; } counts.set(H.tr[i], (counts.get(H.tr[i]) || 0) + 1); }
  flush();
  return [...best.entries()].filter(([, v]) => v.c >= 3).sort((x, y) => y[1].c - x[1].c).slice(0, n).map(([t, v]) => ({ ...trackObj(t), count: v.c, day: v.day }));
}
export function loyalty(n = 15) {
  const A = H.artists.length;
  const first = new Int32Array(A).fill(-1), last = new Int32Array(A).fill(-1);
  const months: (Set<number> | null)[] = new Array(A).fill(null);
  for (let i = 0; i < H.n; i++) {
    if (H.ms[i] < PLAY_MS) continue;
    const ai = H.tArtist[H.tr[i]];
    if (first[ai] < 0) first[ai] = i; last[ai] = i;
    const d = new Date(H.ts[i] * 1000);
    (months[ai] ||= new Set()).add(d.getFullYear() * 12 + d.getMonth());
  }
  const all = ALL(); const rows = [];
  for (let x = 0; x < A; x++) {
    if (first[x] < 0 || all.artPlays[x] < 20) continue;
    rows.push({ name: H.artists[x], i: x, first: H.ts[first[x]], last: H.ts[last[x]], activeMonths: months[x]!.size, plays: all.artPlays[x] });
  }
  return rows.sort((p, q) => q.activeMonths - p.activeMonths || q.plays - p.plays).slice(0, n);
}

/* ---------------- artist deep-dive ---------------- */
export function artistDetail(name: string) {
  const x = H.artistIndex.get(name);
  if (x === undefined) return null;
  const all = ALL();
  const tracks: Track[] = []; for (let t = 0; t < H.tCount; t++) if (H.tArtist[t] === x && all.trEv[t]) tracks.push(trackObj(t, all));
  tracks.sort((p, q) => (q.plays! - p.plays!) || (q.ms! - p.ms!));
  const albums = new Map<string, { name: string; plays: number; ms: number; tracks: number; key: string }>();
  tracks.forEach((t) => { if (!t.album) return; const a = albums.get(t.album) || { name: t.album, plays: 0, ms: 0, tracks: 0, key: t.uri || 'n:' + t.name + '\u0001' + t.artist }; a.plays += t.plays!; a.ms += t.ms!; a.tracks++; albums.set(t.album, a); });
  const firstI = H.artistFirst[x];
  let lastI = -1; const perDay = new Map<number, number>();
  for (let i = 0; i < H.n; i++) {
    if (H.tArtist[H.tr[i]] !== x) continue;
    if (H.ms[i] >= PLAY_MS) lastI = i;
    perDay.set(H.day[i], (perDay.get(H.day[i]) || 0) + H.ms[i]);
  }
  let bestDay: { day: number; ms: number } | null = null;
  for (const [d, m] of perDay) if (!bestDay || m > bestDay.ms) bestDay = { day: d, ms: m };
  const rank = topIdx(all.artMs, H.artists.length).indexOf(x) + 1;
  const series = seriesByBucket(H.first, H.last + 1, H.last - H.first > 86400 * 365 * 2 ? 'month' : 'week', (i) => H.tArtist[H.tr[i]] === x);
  return {
    i: x, name, plays: all.artPlays[x], ms: all.artMs[x], skipRate: all.artEv[x] ? all.artSkip[x] / all.artEv[x] : 0,
    tracks, albums: [...albums.values()].sort((p, q) => q.plays - p.plays),
    first: firstI >= 0 ? { t: H.ts[firstI], track: H.tName[H.tr[firstI]] } : null,
    last: lastI >= 0 ? H.ts[lastI] : null, bestDay, rank, series, share: all.ms ? all.artMs[x] / all.ms : 0,
  };
}

export interface PlayInfo { plays: number; ms: number; skips: number; ev: number }
let lookupCache: { n: number; byUri: Map<string, PlayInfo>; byName: Map<string, PlayInfo> } | null = null;
/** How often you've played a Spotify track (matched by URI, then by title + artist). */
export function playsOf(t: { uri: string; name: string; mainArtist?: string; artist: string }): PlayInfo | null {
  if (!H.loaded) return null;
  if (!lookupCache || lookupCache.n !== H.n) {
    const all = ALL(); const byUri = new Map<string, PlayInfo>(), byName = new Map<string, PlayInfo>();
    for (let t2 = 0; t2 < H.tCount; t2++) {
      const v = { plays: all.trPlays[t2], ms: all.trMs[t2], skips: all.trSkip[t2], ev: all.trEv[t2] };
      if (H.tUri[t2]) byUri.set(H.tUri[t2], v);
      const k = normTitle(H.tName[t2]) + '|' + H.artists[H.tArtist[t2]].toLowerCase();
      const p = byName.get(k); if (!p || v.plays > p.plays) byName.set(k, v);
    }
    lookupCache = { n: H.n, byUri, byName };
  }
  return lookupCache.byUri.get(t.uri) || lookupCache.byName.get(normTitle(t.name) + '|' + (t.mainArtist || t.artist || '').toLowerCase()) || { plays: 0, ms: 0, skips: 0, ev: 0 };
}

/* ---------------- suggestions ---------------- */
function forgetCutoff() {
  const span = H.last - H.first;
  return H.last - (span > 86400 * 365 * 2 ? 86400 * 365 : Math.max(86400 * 60, span / 3));
}
export function forgottenLoves(n = 50): Track[] {
  if (!H.loaded) return [];
  const cutoff = forgetCutoff();
  const before = aggregate(0, cutoff), after = aggregate(cutoff, END);
  const min = Math.max(4, Math.round(Math.log10(H.n + 10) * 2));
  const out: number[] = [];
  for (let t = 0; t < H.tCount; t++) if (before.trPlays[t] >= min && after.trPlays[t] === 0) out.push(t);
  out.sort((p, q) => before.trPlays[q] - before.trPlays[p]);
  return out.slice(0, n).map((t) => {
    let last = 0; for (let i = before.i1 - 1; i >= 0; i--) if (H.tr[i] === t && H.ms[i] >= PLAY_MS) { last = H.ts[i]; break; }
    return { ...trackObj(t, before), last };
  });
}
export function forgottenArtists(n = 12) {
  if (!H.loaded) return [];
  const cutoff = forgetCutoff(); const before = aggregate(0, cutoff), after = aggregate(cutoff, END);
  return topIdx(before.artPlays, 400).filter((x) => after.artPlays[x] === 0 && before.artPlays[x] >= 15).slice(0, n).map((x) => artistObj(x, before));
}
export function playsInWindow(filterHour: (h: number) => boolean) {
  const all = ALL(); const c = new Uint32Array(H.tCount);
  for (let i = 0; i < H.n; i++) if (H.ms[i] >= PLAY_MS && filterHour(H.hour[i])) c[H.tr[i]]++;
  return topIdx(c, 200).map((t) => ({ ...trackObj(t, all), plays: c[t] }));
}

/* ---------------- milestones ---------------- */
export interface Milestone { t: number; kind: string; icon: string; color: string; title: string; sub: string; artist?: string; big?: boolean }
export function milestones(): Milestone[] {
  if (!H.loaded) return [];
  const ev: Milestone[] = [];
  let plays = 0, ms = 0, pk = 0, hk = 0;
  const playMarks = [1, 100, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
  const hourMarks = [100, 500, 1000, 2500, 5000, 10000, 20000];
  for (let i = 0; i < H.n; i++) {
    ms += H.ms[i];
    while (hk < hourMarks.length && ms >= hourMarks[hk] * 3600000) { ev.push({ t: H.ts[i], kind: 'hours', icon: 'clock', color: '#0a84ff', title: `${fmtN(hourMarks[hk])} hours of music`, sub: `Reached while playing “${H.tName[H.tr[i]]}” by ${H.artists[H.tArtist[H.tr[i]]]}` }); hk++; }
    if (H.ms[i] < PLAY_MS) continue;
    plays++;
    if (pk < playMarks.length && plays === playMarks[pk]) {
      const t = H.tr[i];
      ev.push({ t: H.ts[i], kind: 'plays', icon: plays === 1 ? 'play' : 'trophy', color: plays === 1 ? '#30d158' : '#ff9f0a', title: plays === 1 ? 'Your first stream' : `Song number ${fmtN(plays)}`, sub: `“${H.tName[t]}” by ${H.artists[H.tArtist[t]]}`, big: plays === 1 });
      pk++;
    }
  }
  const all = ALL();
  topIdx(all.artMs, 10).forEach((x, r) => { const i = H.artistFirst[x]; if (i < 0) return; ev.push({ t: H.ts[i], kind: 'artist', icon: 'artists', color: '#bf5af2', artist: H.artists[x], title: `You discovered ${H.artists[x]}`, sub: `First song: “${H.tName[H.tr[i]]}” · now your #${r + 1} artist` }); });
  const h = habits(0, END); let bd: { d: number; ms: number } | null = null; for (const [d, m] of h.daily) if (!bd || m > bd.ms) bd = { d, ms: m };
  if (bd) ev.push({ t: dayToSec(bd.d) + 43200, kind: 'day', icon: 'flame', color: '#ff375f', title: 'Your biggest listening day', sub: `${fmtLongDur(bd.ms)} of music in one day`, big: true });
  const st = streaks();
  if (st.best.len > 1) ev.push({ t: dayToSec(st.best.e) + 43200, kind: 'streak', icon: 'calendar', color: '#ff9f0a', title: `${st.best.len}-day listening streak`, sub: `Every day from ${fmtDate(dayToSec(st.best.s))} to ${fmtDate(dayToSec(st.best.e))}`, big: true });
  const rep = replayStats(0, END, 1)[0];
  if (rep) ev.push({ t: dayToSec(rep.day) + 43200, kind: 'repeat', icon: 'repeat', color: '#64d2ff', title: `${rep.count} plays in one day`, sub: `You couldn't stop playing “${rep.name}” by ${rep.artist}` });
  yearlyTop(1).forEach(({ y, artists }) => { if (!artists[0]) return; const end = Math.min(H.last, periodRange({ kind: 'year', y })[1] - 1); ev.push({ t: end, kind: 'yeartop', icon: 'sparkle', color: '#ff375f', artist: artists[0].name, title: `${y}'s top artist: ${artists[0].name}`, sub: `${fmtHours(artists[0].ms)} hours together that year` }); });
  return ev.sort((p, q) => q.t - p.t);
}

/* ---------------- wrapped ---------------- */
export function wrappedData(p: Period) {
  const [a, b] = periodRange(p);
  const agg = aggregate(a, b);
  if (!agg.plays) return null;
  const pp = prevPeriod(p); const prev = pp ? aggregate(...periodRange(pp)) : null;
  const hb = habits(a, b);
  let bigDay: { d: number; ms: number } | null = null; for (const [d, m] of hb.daily) if (!bigDay || m > bigDay.ms) bigDay = { d, ms: m };
  let bigDayTop: (Track & { n: number }) | null = null;
  if (bigDay) {
    const c = new Map<number, number>(); const [i0, i1] = idxRange(a, b);
    for (let i = i0; i < i1; i++) if (H.day[i] === bigDay.d && H.ms[i] >= PLAY_MS) c.set(H.tr[i], (c.get(H.tr[i]) || 0) + 1);
    let best: { t: number; n: number } | null = null; for (const [t, n] of c) if (!best || n > best.n) best = { t, n };
    if (best) bigDayTop = { ...trackObj(best.t), n: best.n };
  }
  const newArtists: number[] = []; for (let x = 0; x < H.artists.length; x++) { const i = H.artistFirst[x]; if (i >= agg.i0 && i < agg.i1) newArtists.push(x); }
  newArtists.sort((p2, q) => agg.artMs[q] - agg.artMs[p2]);
  const artists = topArtists(agg, 5, 'ms'), tracks = topTracks(agg, 5, 'plays');
  const topArtistFirst = artists[0] ? H.artistFirst[artists[0].i!] : -1;
  let topSongDay: { d: number; n: number } | null = null;
  if (tracks[0]) { const c = new Map<number, number>(); const [i0, i1] = idxRange(a, b); for (let i = i0; i < i1; i++) if (H.tr[i] === tracks[0].i && H.ms[i] >= PLAY_MS) c.set(H.day[i], (c.get(H.day[i]) || 0) + 1); for (const [d, n] of c) if (!topSongDay || n > topSongDay.n) topSongDay = { d, n }; }
  return {
    p, label: periodLabel(p), ms: agg.ms, plays: agg.plays, prevMs: prev ? prev.ms : 0, days: agg.days,
    artists, tracks, persona: personaFromHours(hb.hours), hours: hb.hours,
    bigDay, bigDayTop, newArtists: newArtists.length, bestNew: newArtists[0] !== undefined ? artistObj(newArtists[0], agg) : null,
    topArtistSince: topArtistFirst >= 0 ? H.ts[topArtistFirst] : null, topSongDay, uniqArtists: agg.uniqArtists, uniqTracks: agg.uniqTracks,
  };
}
export type Wrapped = NonNullable<ReturnType<typeof wrappedData>>;
export const trackKey = (t: { uri?: string; name: string; artist: string }) => t.uri || 'n:' + t.name + '\u0001' + t.artist;
