/* Shareable cards: drawn on a canvas, exported as PNG. */
import { hashStr } from './format';

export interface ShareSpec {
  eyebrow?: string; period?: string; title?: string; line?: string; big?: string; bigSize?: number; unit?: string;
  image?: string; round?: boolean; items?: { name: string; sub?: string; image?: string }[]; roundItems?: boolean; theme?: number;
}
const THEMES = [
  ['#ff375f', '#bf5af2', '#2a0f45', '#140814'],
  ['#ff9f0a', '#ff375f', '#4a1d10', '#160a08'],
  ['#0a84ff', '#30d158', '#0d2445', '#06121c'],
  ['#bf5af2', '#5e5ce6', '#1b1050', '#0a0818'],
  ['#ff6482', '#ffd60a', '#5c1d2a', '#170a0c'],
];
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Figtree", "Segoe UI", sans-serif';
const loadImg = (url?: string) => new Promise<HTMLImageElement | null>((res) => { if (!url) return res(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight: number) {
  let s = size; g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > size * 0.5) { s -= 2; g.font = `${weight} ${s}px ${FONT}`; }
  let t = text; while (g.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…';
  g.fillText(t, x, y);
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = '';
  for (const w of String(text).split(' ')) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = test; }
  if (line) g.fillText(line, x, y);
  return y;
}

async function draw(spec: ShareSpec, withImages: boolean) {
  const W = 1080, H = 1350; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const th = THEMES[(spec.theme ?? hashStr(spec.title || '')) % THEMES.length];
  g.fillStyle = th[3]; g.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, col: string, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
  blob(120, 1250, 900, th[0], 0.9); blob(1000, 120, 800, th[1], 0.75); blob(700, 700, 600, th[2], 0.6);
  // glass panel
  g.save(); rr(g, 50, 50, W - 100, H - 100, 64); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.stroke(); g.restore();
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  rr(g, 100, 104, 52, 52, 14); g.fillStyle = '#fa2d48'; g.fill();
  g.fillStyle = '#fff'; g.font = `800 30px ${FONT}`; g.fillText('♪', 114, 142);
  g.font = `700 34px ${FONT}`; g.fillText('Encore', 168, 142);
  g.globalAlpha = 0.8; g.font = `600 30px ${FONT}`; g.textAlign = 'right'; g.fillText(spec.period || '', W - 100, 142); g.textAlign = 'left'; g.globalAlpha = 1;
  let y = !spec.image && !spec.items?.length ? 470 : 270;
  g.globalAlpha = 0.85; g.font = `700 34px ${FONT}`; g.fillText((spec.eyebrow || '').toUpperCase(), 100, y); g.globalAlpha = 1; y += 26;
  if (spec.image && withImages) {
    const im = await loadImg(spec.image);
    if (im) { const s = 380; g.save(); if (spec.round) { g.beginPath(); g.arc(100 + s / 2, y + 30 + s / 2, s / 2, 0, Math.PI * 2); g.clip(); } else { rr(g, 100, y + 30, s, s, 28); g.clip(); } g.drawImage(im, 100, y + 30, s, s); g.restore(); y += s + 60; }
  }
  if (spec.big) {
    const bs = spec.bigSize || 200; y += bs * 0.85; fit(g, spec.big, 100, y, W - 200, bs, 800); y += 30;
    if (spec.unit) { g.font = `700 54px ${FONT}`; y += 50; g.fillText(spec.unit, 100, y); }
  }
  if (spec.title) { y += 90; fit(g, spec.title, 100, y, W - 200, 84, 800); }
  if (spec.line) { y += 70; g.globalAlpha = 0.88; g.font = `500 40px ${FONT}`; y = wrap(g, spec.line, 100, y, W - 200, 52); g.globalAlpha = 1; }
  if (spec.items?.length) {
    y += 40;
    const imgs = withImages ? await Promise.all(spec.items.map((it) => loadImg(it.image))) : [];
    spec.items.slice(0, 5).forEach((it, k) => {
      const ry = y + k * 150;
      g.font = `800 54px ${FONT}`; g.globalAlpha = 0.9; g.fillText(String(k + 1), 100, ry + 80); g.globalAlpha = 1;
      let tx = 180;
      const im = imgs[k];
      if (im) { g.save(); if (spec.roundItems) { g.beginPath(); g.arc(180 + 55, ry + 55, 55, 0, Math.PI * 2); g.clip(); } else { rr(g, 180, ry, 110, 110, 16); g.clip(); } g.drawImage(im, 180, ry, 110, 110); g.restore(); tx = 320; }
      g.font = `700 46px ${FONT}`; fit(g, it.name, tx, ry + 52, W - tx - 100, 46, 700);
      g.globalAlpha = 0.75; g.font = `500 34px ${FONT}`; fit(g, it.sub || '', tx, ry + 98, W - tx - 100, 34, 500); g.globalAlpha = 1;
    });
  }
  g.globalAlpha = 0.7; g.font = `500 28px ${FONT}`; g.fillText('Made with Encore · my Spotify listening', 100, H - 100); g.globalAlpha = 1;
  return c;
}
export async function cardBlob(spec: ShareSpec): Promise<Blob> {
  const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => { try { c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'); } catch (e) { rej(e); } });
  try { return await toBlob(await draw(spec, true)); }
  catch { return toBlob(await draw(spec, false)); } // a cross-origin image tainted the canvas
}
