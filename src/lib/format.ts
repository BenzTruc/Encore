const NF = new Intl.NumberFormat(undefined);
const CF = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export const fmtN = (n: number) => NF.format(Math.round(n || 0));
export const fmtCompact = (n: number) => CF.format(n || 0);
export const fmtMin = (ms: number) => fmtN((ms || 0) / 60000);
export const fmtHours = (ms: number) => {
  const h = (ms || 0) / 3600000;
  return h >= 100 ? fmtN(h) : (Math.round(h * 10) / 10).toLocaleString();
};
export const fmtDur = (ms: number) => {
  const s = Math.round((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtLongDur = (ms: number) => {
  const m = Math.round((ms || 0) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} hr ${mm} min` : `${h} hr`;
};
export const pct = (x: number, d = 0) => `${((x || 0) * 100).toFixed(d)}%`;
export const plural = (n: number, one: string, many?: string) => `${fmtN(n)} ${n === 1 ? one : many || one + 's'}`;

export const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2020, i, 1).toLocaleString(undefined, { month: 'short' }));
export const MONTHS_LONG = Array.from({ length: 12 }, (_, i) => new Date(2020, i, 1).toLocaleString(undefined, { month: 'long' }));
export const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 2 + i).toLocaleString(undefined, { weekday: 'short' })); // Mon..Sun

export const fmtDate = (sec: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(sec * 1000).toLocaleDateString(undefined, opts);
export const fmtHour = (h: number) => new Date(2020, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
export const agoText = (ms: number) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const TILE_GRADS: [string, string][] = [
  ['#ff375f', '#a2194b'], ['#bf5af2', '#4b1d8c'], ['#0a84ff', '#123b8a'], ['#ff9f0a', '#b4361a'],
  ['#30d158', '#0f5b4a'], ['#64d2ff', '#1d4f8f'], ['#ff6482', '#6b1d5c'], ['#ffd60a', '#c2410c'],
  ['#5e5ce6', '#22195e'], ['#ac8e68', '#3d2c1e'], ['#66d4cf', '#0e4a5c'], ['#ff453a', '#5c1414'],
];
export const tileColors = (name: string) => TILE_GRADS[hashStr(name || '?') % TILE_GRADS.length];
export const tileGrad = (name: string) => { const g = tileColors(name); return `linear-gradient(140deg, ${g[0]}, ${g[1]})`; };
export function initials(name: string) {
  const w = String(name || '?').replace(/^the\s+/i, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '♪';
  return (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase();
}
export function normTitle(s: string) {
  return String(s || '').toLowerCase()
    .replace(/\s*[([].*?(remaster|version|edit|mono|stereo|live|deluxe|feat\.?|ft\.?|with).*?[)\]]/g, '')
    .replace(/\s+-\s+.*(remaster|version|edit|mono|stereo|live).*$/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function shuffleArr<T>(a: T[], seed = Date.now()): T[] {
  a = a.slice(); let s = seed % 2147483647 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Reorder so the same artist never plays twice in a row (when possible). */
export function spreadByArtist<T>(items: T[], getArtist: (t: T) => string): T[] {
  const groups = new Map<string, T[]>();
  items.forEach((it) => { const a = getArtist(it); if (!groups.has(a)) groups.set(a, []); groups.get(a)!.push(it); });
  const out: T[] = []; let last: string | null = null;
  while (out.length < items.length) {
    const cands = [...groups.entries()].filter(([, l]) => l.length).sort((x, y) => y[1].length - x[1].length);
    const pick = cands.find(([a]) => a !== last) || cands[0];
    out.push(pick[1].shift()!); last = pick[0];
  }
  return out;
}
export const uid = () => Math.random().toString(36).slice(2, 10);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
