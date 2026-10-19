import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Art, Segmented, Loading, Note } from './ui';
import { BrandMark } from '@/layout/Shell';
import { useApp, toast } from '@/store/app';
import { cardBlob } from '@/lib/share';
import { Spotify, savePlaylist, liveTrack } from '@/lib/spotify';
import { H, ALL, aggregate, forgottenLoves, periodRange, playsInWindow, sec, skipStats, topArtists, topTracks, trackKey, trackObj, yearsInData, type Track } from '@/lib/history';
import { fmtN, plural, spreadByArtist } from '@/lib/format';
import { LIVE_RANGES } from '@/lib/constants';

/* ---------- Toasts ---------- */
export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast glass strong ${t.kind || ''}`} initial={{ opacity: 0, y: -16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
            {t.kind === 'ok' && <Icon name="check" />}{t.kind === 'err' && <Icon name="info" />}<span>{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Share card sheet ---------- */
export function ShareSheet() {
  const spec = useApp((s) => s.share); const close = () => useApp.getState().openShare(null);
  const [img, setImg] = useState<{ url: string; file: File } | null>(null);
  useEffect(() => {
    if (!spec) { setImg(null); return; }
    let url = ''; let alive = true;
    cardBlob(spec).then((b) => {
      if (!alive) return;
      url = URL.createObjectURL(b);
      const name = 'encore-' + (spec.title || spec.eyebrow || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.png';
      setImg({ url, file: new File([b], name, { type: 'image/png' }) });
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [spec]);
  const canShare = !!(img && navigator.canShare?.({ files: [img.file] }));
  const save = () => { if (!img) return; const a = document.createElement('a'); a.href = img.url; a.download = img.file.name; document.body.appendChild(a); a.click(); a.remove(); toast('Image saved', 'ok'); };
  return (
    <Sheet open={!!spec} title="Share" onClose={close} footer={img && <>{canShare && <button className="btn plain" onClick={() => navigator.share({ files: [img.file], title: spec?.title || 'Encore' }).catch(() => {})}><Icon name="share" />Share…</button>}<button className="btn primary" onClick={save}><Icon name="down" />Save image</button></>}>
      {img ? <img className="share-preview" src={img.url} alt="Share card preview" /> : <Loading text="Drawing your card…" />}
    </Sheet>
  );
}

/* ---------- Save tracks as a Spotify playlist ---------- */
export function SaveSheet() {
  const req = useApp((s) => s.saveTracks); const close = () => useApp.getState().openSave(null);
  const [name, setName] = useState(''); const [pub, setPub] = useState(false);
  const [state, setState] = useState<{ busy?: boolean; msg?: string; p?: number; err?: string; done?: { id: string; url?: string; count: number } }>({});
  useEffect(() => { if (req) { setName(req.name); setState({}); } }, [req]);
  const go = async () => {
    if (!req) return;
    setState({ busy: true, msg: 'Starting', p: 0.02 });
    try {
      const r = await savePlaylist({ name: name.trim() || req.name, description: 'Made with Encore', tracks: req.tracks, isPublic: pub, onProgress: (msg, p) => setState({ busy: true, msg, p }) });
      setState({ done: { id: r.playlist.id, url: r.playlist.external_urls?.spotify, count: r.count } });
      useApp.getState().bumpSpotify();
    } catch (e) { setState({ err: (e as Error).message }); }
  };
  const foot = state.done
    ? <><Link className="btn plain" to={`/playlist/${state.done.id}`} onClick={close}>View in Encore</Link>{state.done.url && <a className="btn primary" href={state.done.url} target="_blank" rel="noopener"><Icon name="external" />Open in Spotify</a>}</>
    : <><button className="btn plain" onClick={close}>Cancel</button><button className="btn primary" onClick={go} disabled={state.busy}><Icon name="plus" />Create playlist</button></>;
  return (
    <Sheet open={!!req} title="Save to Spotify" onClose={close} footer={foot}>
      {!Spotify.connected ? <Note icon="spotify"><Link to="/settings" onClick={close}>Connect Spotify</Link> to save playlists.</Note> : <>
        <div className="field"><label htmlFor="plName">Playlist name</label><input id="plName" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <label className="check"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />Show on my Spotify profile</label>
        <p className="muted small">{plural(req?.tracks.length || 0, 'song')} will be added to a new playlist in your Spotify library.</p>
        {state.busy && <div style={{ display: 'grid', gap: 8 }}><div className="muted small">{state.msg}</div><div className="progress"><i style={{ width: `${Math.round((state.p || 0) * 100)}%` }} /></div></div>}
        {state.err && <Note>{state.err}</Note>}
        {state.done && <Note icon="check">Created <b>{name}</b> with {plural(state.done.count, 'song')}.</Note>}
      </>}
    </Sheet>
  );
}

/* ---------- Smart playlist generator ---------- */
const SEASONS: [string, string][] = [['winter', 'Winter'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn']];
function seasonRange(y: number, s: string): [number, number] {
  const r: Record<string, [Date, Date]> = { winter: [new Date(y - 1, 11, 1), new Date(y, 2, 1)], spring: [new Date(y, 2, 1), new Date(y, 5, 1)], summer: [new Date(y, 5, 1), new Date(y, 8, 1)], autumn: [new Date(y, 8, 1), new Date(y, 11, 1)] };
  return [sec(r[s][0]), sec(r[s][1])];
}
const TEMPLATES = [
  { id: 'year', label: 'Top of a year', hist: true }, { id: 'season', label: 'A season', hist: true }, { id: 'repeat', label: 'On repeat' },
  { id: 'forgotten', label: 'Forgotten favorites', hist: true }, { id: 'artist', label: 'Artist mix', hist: true }, { id: 'finish', label: 'Never skipped', hist: true },
  { id: 'night', label: 'Late night', hist: true }, { id: 'spotify', label: 'Spotify top songs', live: true },
];
interface Gen { template: string; len: number; year: number; season: string; range: string; artists: string[] }
async function genTracks(g: Gen): Promise<{ tracks: Track[]; name: string }> {
  const n = g.len;
  if (g.template === 'spotify' || (g.template === 'repeat' && !H.loaded)) {
    const r = g.template === 'repeat' ? 'short_term' : g.range;
    const tt = await Spotify.top('tracks', r, 50);
    return { tracks: tt.map(liveTrack).slice(0, n), name: g.template === 'repeat' ? 'On repeat' : `My top songs · ${LIVE_RANGES.find((x) => x[0] === r)![1].toLowerCase()}` };
  }
  if (!H.loaded) return { tracks: [], name: '' };
  switch (g.template) {
    case 'year': return { tracks: topTracks(aggregate(...periodRange({ kind: 'year', y: g.year })), n), name: `My top songs of ${g.year}` };
    case 'season': return { tracks: topTracks(aggregate(...seasonRange(g.year, g.season)), n), name: `${SEASONS.find((s) => s[0] === g.season)![1]} ${g.year}` };
    case 'repeat': return { tracks: topTracks(aggregate(H.last - 30 * 86400, H.last + 1), n), name: 'On repeat' };
    case 'forgotten': return { tracks: forgottenLoves(n), name: 'Forgotten favorites' };
    case 'finish': { const all = ALL(); const list = [...skipStats(all).alwaysFinish, ...topTracks(all, n * 3).filter((t) => !t.skips)]; return { tracks: list.filter((t, i) => list.findIndex((x) => x.i === t.i) === i).slice(0, n), name: 'Never skipped' }; }
    case 'night': return { tracks: playsInWindow((h) => h >= 23 || h < 4).slice(0, n), name: 'After midnight' };
    case 'artist': {
      const names = g.artists.filter((a) => H.artistIndex.has(a)); if (!names.length) return { tracks: [], name: 'Artist mix' };
      const all = ALL(); const per = Math.ceil(n / names.length);
      const picks = names.flatMap((a) => { const x = H.artistIndex.get(a)!; const ts: Track[] = []; for (let t = 0; t < H.tCount; t++) if (H.tArtist[t] === x && all.trPlays[t]) ts.push(trackObj(t, all)); return ts.sort((p, q) => q.plays! - p.plays!).slice(0, per); });
      return { tracks: spreadByArtist(picks, (t) => t.artist).slice(0, n), name: names.length === 1 ? `Best of ${names[0]}` : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' & more' : ''} mix` };
    }
  }
  return { tracks: [], name: '' };
}
export function GeneratorSheet() {
  const req = useApp((s) => s.generator); const close = () => useApp.getState().openGenerator(null);
  const years = useMemo(() => yearsInData(), [req]); // eslint-disable-line react-hooks/exhaustive-deps
  const [g, setG] = useState<Gen>({ template: 'year', len: 30, year: new Date().getFullYear(), season: 'summer', range: 'short_term', artists: [] });
  const [res, setRes] = useState<{ tracks: Track[]; name: string } | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState(''); const touched = useRef(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [artistInput, setArtistInput] = useState('');
  const artistNames = useMemo(() => (H.loaded ? topArtists(ALL(), 300, 'ms').map((a) => a.name) : []), [req]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!req) return;
    setG((x) => ({ ...x, template: req.template || (H.loaded ? 'year' : 'spotify'), artists: req.artists || [], year: years[0] || x.year }));
    touched.current = false; setExcluded(new Set());
  }, [req, years]);
  useEffect(() => {
    if (!req) return; let alive = true; setRes(null); setErr('');
    genTracks(g).then((r) => { if (!alive) return; setRes(r); if (!touched.current) setName(r.name); }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [g, req]);
  const tpls = TEMPLATES.filter((t) => (!t.hist || H.loaded) && (!t.live || Spotify.connected));
  const tracks = (res?.tracks || []).filter((t) => !excluded.has(trackKey(t)));
  const set = (p: Partial<Gen>) => { touched.current = false; setG((x) => ({ ...x, ...p })); setExcluded(new Set()); };
  const addArtist = (v: string) => { const hit = artistNames.find((a) => a.toLowerCase() === v.trim().toLowerCase()); if (hit && !g.artists.includes(hit)) { set({ artists: [...g.artists, hit] }); setArtistInput(''); } };
  return (
    <Sheet open={!!req} wide title="New smart playlist" onClose={close} footer={<><button className="btn plain" onClick={close}>Cancel</button><button className="btn primary" disabled={!tracks.length} onClick={() => { close(); useApp.getState().openSave({ tracks, name: name || res?.name || 'Encore mix' }); }}><Icon name="plus" />Save to Spotify</button></>}>
      <div className="chips">{tpls.map((t) => <button key={t.id} className={`chip ${t.id === g.template ? 'accent' : ''}`} onClick={() => set({ template: t.id })}>{t.label}</button>)}</div>
      {(g.template === 'year' || g.template === 'season' || g.template === 'spotify' || g.template === 'artist') && (
        <div className="btn-row">
          {(g.template === 'year' || g.template === 'season') && <select className="input" aria-label="Year" value={g.year} onChange={(e) => set({ year: +e.target.value })}>{years.map((y) => <option key={y}>{y}</option>)}</select>}
          {g.template === 'season' && <Segmented options={SEASONS} value={g.season} onChange={(v) => set({ season: v })} label="Season" />}
          {g.template === 'spotify' && <Segmented options={LIVE_RANGES} value={g.range} onChange={(v) => set({ range: v })} label="Range" />}
          {g.template === 'artist' && <div style={{ display: 'grid', gap: 8, width: '100%' }}>
            {!!g.artists.length && <div className="chips">{g.artists.map((a) => <span key={a} className="chip accent">{a}<button aria-label={`Remove ${a}`} onClick={() => set({ artists: g.artists.filter((x) => x !== a) })} style={{ display: 'inline-flex' }}><Icon name="x" /></button></span>)}</div>}
            {g.artists.length < 6 && <><input className="input" list="genArtists" placeholder="Add an artist…" value={artistInput} onChange={(e) => { setArtistInput(e.target.value); if (artistNames.includes(e.target.value)) addArtist(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') addArtist(artistInput); }} /><datalist id="genArtists">{artistNames.map((a) => <option key={a} value={a} />)}</datalist></>}
          </div>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
        <input type="range" min={10} max={100} step={5} value={g.len} aria-label="Number of songs" onChange={(e) => setG((x) => ({ ...x, len: +e.target.value }))} />
        <span className="tnum" style={{ fontWeight: 650, minWidth: 74, textAlign: 'right' }}>{g.len} songs</span>
      </div>
      <div className="field"><label htmlFor="genName">Name</label><input id="genName" className="input" value={name} onChange={(e) => { touched.current = true; setName(e.target.value); }} /></div>
      {err ? <Note>{err}</Note> : !res ? <Loading text="Picking songs…" /> : tracks.length ? (
        <div>
          <div className="muted small" style={{ margin: '0 4px 6px' }}>{plural(tracks.length, 'song')} · tap × to leave one out</div>
          <div className="list">{tracks.map((t, i) => (
            <div key={trackKey(t)} className="row"><span className="rank">{i + 1}</span><Art name={t.album || t.name} img={t.img} kind="track" k={trackKey(t)} size="xs" /><div style={{ minWidth: 0 }}><div className="t">{t.name}</div><div className="s">{t.artist}</div></div>
              <button className="icon-btn sm plain" aria-label={`Leave out ${t.name}`} onClick={() => setExcluded(new Set([...excluded, trackKey(t)]))}><Icon name="x" /></button></div>
          ))}</div>
        </div>
      ) : <p className="muted">{g.template === 'artist' ? 'Add one or more artists to build a mix.' : 'Nothing to add for this choice.'}</p>}
    </Sheet>
  );
}

/* ---------- Wrapped story player ---------- */
export const storyBg = (k: number) => {
  const C = [['#ff375f', '#bf5af2', '#2a0f45'], ['#ff9f0a', '#ff375f', '#3b0f1c'], ['#0a84ff', '#5e5ce6', '#0b1438'], ['#30d158', '#0a84ff', '#06241f'], ['#bf5af2', '#ff6482', '#250a2f'], ['#ffd60a', '#ff9f0a', '#3b1a05'], ['#64d2ff', '#30d158', '#062a33'], ['#ff453a', '#ff9f0a', '#330808']];
  const c = C[k % C.length];
  return `radial-gradient(60% 50% at 20% 85%, ${c[0]} 0%, transparent 70%), radial-gradient(55% 45% at 85% 15%, ${c[1]} 0%, transparent 70%), radial-gradient(70% 60% at 60% 55%, ${c[2]} 0%, transparent 80%), #0b0b0d`;
};
export function StoryPlayer() {
  const story = useApp((s) => s.story); const close = () => useApp.getState().openStory(null);
  const [i, setI] = useState(0); const [paused, setPaused] = useState(false);
  const barRef = useRef<HTMLElement | null>(null);
  const elapsed = useRef(0); const DUR = 7000;
  const n = story?.slides.length || 0;
  useEffect(() => { setI(0); setPaused(false); }, [story]);
  useEffect(() => {
    if (!story) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setI((x) => Math.min(n - 1, x + 1)); } if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [story, n]);
  useEffect(() => {
    if (!story || paused) return;
    let raf = 0; const start = performance.now() - elapsed.current;
    const loop = (t: number) => {
      const p = Math.min(1, (t - start) / DUR); elapsed.current = t - start;
      if (barRef.current) barRef.current.style.width = p * 100 + '%';
      if (p >= 1) { elapsed.current = 0; if (i < n - 1) setI(i + 1); else setPaused(true); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [story, i, paused, n]);
  useEffect(() => { elapsed.current = 0; }, [i]);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hold = useRef(0);
  return (
    <AnimatePresence>
      {story && (
        <motion.div className="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="story-frame" initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <div className="story-bars">{story.slides.map((_, k) => <i key={k}><b ref={k === i ? (el) => { barRef.current = el; } : undefined} style={{ width: k < i ? '100%' : k > i ? '0' : undefined }} /></i>)}</div>
            <div className="story-top"><div className="brandline"><BrandMark />Encore</div><button className="icon-btn glass" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={i} className="story-slide" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
                <div className={`story-bg ${reduce ? '' : 'anim'}`} style={{ background: storyBg(story.slides[i].bg) }} />
                {story.slides[i].node}
              </motion.div>
            </AnimatePresence>
            <div className="story-nav"
              onPointerDown={() => { hold.current = performance.now(); setPaused(true); }}
              onPointerUp={(e) => {
                const held = performance.now() - hold.current > 350; setPaused(false);
                if (held) return;
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                if (e.clientX - r.left < r.width / 3) setI((x) => Math.max(0, x - 1)); else if (i < n - 1) setI(i + 1);
              }}
              onPointerCancel={() => setPaused(false)} />
            <div className="story-share"><button className="btn glass" onClick={() => { setPaused(true); useApp.getState().openShare(story.slides[i].share); }}><Icon name="share" />Share this</button></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Animated count-up number for story slides. */
export function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 1200); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{fmtN(v)}</>;
}
