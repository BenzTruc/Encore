import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { Art, Empty, List, Loading, NeedSpotify, Note, SectionHead, Segmented, Stat, TrackRow } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { BarChart, HBars } from '@/charts/Charts';
import { useApp, toast } from '@/store/app';
import { useAmbient, useHistory, useSpotify } from '@/hooks/data';
import { useConfirm } from '@/hooks/useConfirm';
import { Spotify, invalidate, pickImg, type PlItem, type SpPlaylist } from '@/lib/spotify';
import { playsOf } from '@/lib/history';
import { MONTHS, fmtDate, fmtDur, fmtLongDur, fmtN, hashStr, normTitle, pct, plural, shuffleArr, spreadByArtist } from '@/lib/format';

const owned = (p: SpPlaylist, meId?: string) => p.owner?.id === meId || !!p.collaborative;
const total = (p: SpPlaylist) => p.items?.total ?? p.tracks?.total ?? 0;

function MergeSheet({ open, onClose, lists }: { open: boolean; onClose: () => void; lists: SpPlaylist[] }) {
  const [sel, setSel] = useState<string[]>([]); const [name, setName] = useState(''); const [auto, setAuto] = useState(true);
  const [dedupe, setDedupe] = useState(true); const [busy, setBusy] = useState(''); const nav = useNavigate();
  const toggle = (id: string) => { const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]; setSel(next); if (auto) setName(lists.filter((p) => next.includes(p.id)).map((p) => p.name).join(' + ').slice(0, 90)); };
  const go = async () => {
    try {
      setBusy('Reading playlists…');
      let all: PlItem[] = []; for (const id of sel) all.push(...(await Spotify.playlistItems(id)));
      all = all.filter((t) => !t.local);
      if (dedupe) { const seen = new Set<string>(); all = all.filter((t) => { const k = normTitle(t.name) + '|' + t.mainArtist.toLowerCase(); if (seen.has(t.uri) || seen.has(k)) return false; seen.add(t.uri); seen.add(k); return true; }); }
      const n = name.trim() || 'Merged playlist';
      setBusy(`Creating “${n}” with ${plural(all.length, 'song')}…`);
      const p = await Spotify.createPlaylist(n, 'Merged with Encore'); await Spotify.addItems(p.id, all.map((t) => t.uri));
      useApp.getState().bumpSpotify(); onClose(); toast(`Created ${n}`, 'ok'); nav('/playlist/' + p.id);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(''); }
  };
  return (
    <Sheet open={open} wide title="Merge playlists" onClose={onClose} footer={<><button className="btn plain" onClick={onClose}>Cancel</button><button className="btn primary" disabled={sel.length < 2 || !!busy} onClick={go}><Icon name="merge" />Merge</button></>}>
      <p className="muted">Pick two or more of your playlists. Encore creates a new playlist with all their songs; the originals stay untouched.</p>
      <div className="list">{lists.map((p) => (
        <button key={p.id} className={`row checkable`} onClick={() => toggle(p.id)} aria-pressed={sel.includes(p.id)}>
          <span className={`check-dot ${sel.includes(p.id) ? 'on' : ''}`}><Icon name="check" /></span><Art name={p.name} img={pickImg(p.images, 64)} size="sm" />
          <div style={{ minWidth: 0 }}><div className="t">{p.name}</div><div className="s">{plural(total(p), 'song')}</div></div><span />
        </button>
      ))}</div>
      <div className="field"><label htmlFor="mergeName">New playlist name</label><input id="mergeName" className="input" placeholder="Merged playlist" value={name} onChange={(e) => { setAuto(false); setName(e.target.value); }} /></div>
      <label className="check"><input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />Leave out duplicates</label>
      {busy && <Loading text={busy} />}
    </Sheet>
  );
}

export function Playlists() {
  const me = useSpotify(['me'], () => Spotify.me());
  const pls = useSpotify(['playlists'], () => Spotify.playlists());
  const [merge, setMerge] = useState(false);
  const head = (
    <div className="page-head">
      <div><h1 className="large-title">Playlists</h1><p className="page-sub">Build smart playlists, clean up old ones, merge and split.</p></div>
      <div className="btn-row"><button className="btn primary" onClick={() => useApp.getState().openGenerator({})}><Icon name="wand" />New smart playlist</button>{Spotify.connected && <button className="btn glass" onClick={() => setMerge(true)}><Icon name="merge" />Merge</button>}</div>
    </div>
  );
  if (!Spotify.connected) return <>{head}<NeedSpotify what="Seeing and editing your playlists" /></>;
  if (pls.isLoading || me.isLoading) return <>{head}<Loading /></>;
  if (pls.error) return <>{head}<Note>{(pls.error as Error).message}</Note></>;
  const mine = (pls.data || []).filter((p) => owned(p, me.data?.id)), other = (pls.data || []).filter((p) => !owned(p, me.data?.id));
  const Tile = ({ p, own }: { p: SpPlaylist; own: boolean }) => (
    <Link className="tile" to={`/playlist/${p.id}`}><Art name={p.name} img={pickImg(p.images, 300)} /><div className="tile-title">{p.name}</div><div className="tile-sub">{!own && <Icon name="lock" />} {plural(total(p), 'song')}{!own && ` · ${p.owner?.display_name || 'Spotify'}`}</div></Link>
  );
  return (
    <>
      {head}
      <section className="section" style={{ marginTop: 0 }}><SectionHead title="Your playlists" note={plural(mine.length, 'playlist')} />
        {mine.length ? <div className="grid-tiles">{mine.map((p) => <Tile key={p.id} p={p} own />)}</div> : <p className="muted">You haven’t made any playlists yet. Start with a smart playlist.</p>}</section>
      {!!other.length && <section className="section"><SectionHead title="Playlists you follow" note="Spotify only lets apps read songs from playlists you own or collaborate on" /><div className="grid-tiles">{other.map((p) => <Tile key={p.id} p={p} own={false} />)}</div></section>}
      <MergeSheet open={merge} onClose={() => setMerge(false)} lists={mine} />
    </>
  );
}

/* ---------------- Playlist detail ---------------- */
type Tab = 'songs' | 'insights' | 'clean' | 'sort' | 'split';
type SortKey = 'artist' | 'title' | 'release' | 'added' | 'duration' | 'plays' | 'spread';
const SORTS: Record<SortKey, [string, ((a: PlItem, b: PlItem) => number) | null]> = {
  artist: ['Artist', (a, b) => a.mainArtist.localeCompare(b.mainArtist) || a.album.localeCompare(b.album)],
  title: ['Title', (a, b) => a.name.localeCompare(b.name)],
  release: ['Release date', (a, b) => (a.release || '').localeCompare(b.release || '')],
  added: ['Date added', (a, b) => a.added - b.added],
  duration: ['Length', (a, b) => a.duration - b.duration],
  plays: ['Your plays', (a, b) => (playsOf(b)?.plays || 0) - (playsOf(a)?.plays || 0)],
  spread: ['Smart shuffle', null],
};

function Insights({ items }: { items: PlItem[] }) {
  const H = useHistory();
  const artists = new Map<string, number>(); items.forEach((t) => artists.set(t.mainArtist, (artists.get(t.mainArtist) || 0) + 1));
  const topA = [...artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const dur = items.reduce((s, t) => s + t.duration, 0);
  const dec = new Map<number, number>(); items.forEach((t) => { const y = parseInt(t.release); if (y) dec.set(Math.floor(y / 10) * 10, (dec.get(Math.floor(y / 10) * 10) || 0) + 1); });
  const added = new Map<number, number>(); items.forEach((t) => { if (!t.added) return; const d = new Date(t.added * 1000); const k = d.getFullYear() * 12 + d.getMonth(); added.set(k, (added.get(k) || 0) + 1); });
  const keys = [...added.keys()].sort((a, b) => a - b); const series: { label: string; short: string; value: number }[] = [];
  if (keys.length) { const byYear = keys[keys.length - 1] - keys[0] > 36; const m = new Map<number, number>(); keys.forEach((k) => { const kk = byYear ? Math.floor(k / 12) : k; m.set(kk, (m.get(kk) || 0) + added.get(k)!); }); const lo = byYear ? Math.floor(keys[0] / 12) : keys[0], hi = byYear ? Math.floor(keys[keys.length - 1] / 12) : keys[keys.length - 1]; for (let k = lo; k <= hi; k++) series.push({ label: byYear ? String(k) : `${MONTHS[k % 12]} ${Math.floor(k / 12)}`, short: byYear ? String(k) : MONTHS[k % 12], value: m.get(k) || 0 }); }
  const withP = H.loaded ? items.map((t) => ({ t, p: playsOf(t)! })) : [];
  const never = withP.filter((x) => !x.p.plays); const most = withP.slice().sort((a, b) => b.p.plays - a.p.plays).slice(0, 5);
  const totalPlays = withP.reduce((s, x) => s + x.p.plays, 0);
  return (
    <>
      <div className="stats"><Stat k="Songs" v={fmtN(items.length)} /><Stat k="Length" v={fmtLongDur(dur)} sm /><Stat k="Artists" v={fmtN(artists.size)} /><Stat k="Average song" v={fmtDur(dur / items.length)} /></div>
      <section className="section"><div className="cols">
        <div className="card glass"><h3>Who's on it</h3><p className="card-sub">Songs per artist</p><HBars rows={topA.map(([a, n]) => ({ label: <Link to={`/artist/${encodeURIComponent(a)}`} style={{ color: 'inherit' }}>{a}</Link>, value: n }))} fmt={(v) => plural(v, 'song')} /></div>
        <div className="card glass"><h3>Release decades</h3><p className="card-sub">When the songs came out</p>{dec.size ? <HBars rows={[...dec.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => ({ label: `${d}s`, value: n }))} fmt={(v) => plural(v, 'song')} color="var(--s7)" /> : <p className="muted">No release dates.</p>}</div>
      </div></section>
      {series.length > 1 && <section className="section"><SectionHead title="When songs were added" /><div className="card glass"><BarChart items={series} height={170} fmt={fmtN} /></div></section>}
      {H.loaded && <section className="section"><SectionHead title="How you play it" note="From your listening history" />
        <div className="stats" style={{ marginBottom: 16 }}><Stat k="Plays of these songs" v={fmtN(totalPlays)} /><Stat k="Never played" v={fmtN(never.length)} d={`${pct(never.length / items.length)} of the playlist`} /><Stat k="Average per song" v={(totalPlays / items.length).toFixed(1)} /></div>
        <div className="cols">
          <div><div className="col-title">Most played here</div><List>{most.map((x, i) => <TrackRow key={x.t.pos} t={x.t} rank={i + 1} value={<><b>{fmtN(x.p.plays)}</b> plays</>} />)}</List></div>
          <div><div className="col-title">Never played</div>{never.length ? <><List>{never.slice(0, 5).map((x) => <TrackRow key={x.t.pos} t={x.t} value={fmtDur(x.t.duration)} />)}</List>{never.length > 5 && <p className="muted small" style={{ margin: 8 }}>and {fmtN(never.length - 5)} more</p>}</> : <p className="muted">You’ve played every song here.</p>}</div>
        </div></section>}
    </>
  );
}

function Clean({ pl, items, onDone }: { pl: SpPlaylist; items: PlItem[]; onDone: () => void }) {
  const H = useHistory();
  const groups = useMemo(() => { const g = new Map<string, PlItem[]>(); items.forEach((t) => { const k = normTitle(t.name) + '|' + t.mainArtist.toLowerCase(); if (!g.has(k)) g.set(k, []); g.get(k)!.push(t); }); return [...g.values()].filter((x) => x.length > 1); }, [items]);
  const skipped = useMemo(() => (H.loaded ? items.map((t) => ({ t, p: playsOf(t)! })).filter((x) => x.p.ev >= 4 && x.p.skips / x.p.ev >= 0.6) : []), [items, H.loaded]);
  const [sel, setSel] = useState<Set<number>>(() => new Set(groups.flatMap((g) => g.slice(1).map((t) => t.pos))));
  const [confirmNode, ask] = useConfirm();
  const toggle = (p: number) => { const s = new Set(sel); if (s.has(p)) s.delete(p); else s.add(p); setSel(s); };
  const apply = async () => {
    const keep = items.filter((t) => !sel.has(t.pos)), removed = items.filter((t) => sel.has(t.pos));
    const keptUris = new Set(keep.map((t) => t.uri)); const rewrite = removed.some((t) => keptUris.has(t.uri));
    if (!(await ask({ title: `Remove ${plural(removed.length, 'song')}?`, text: rewrite ? 'Some of these are exact copies of songs you’re keeping, so Encore rewrites the playlist. “Date added” resets for every song.' : `They'll be removed from “${pl.name}” on Spotify.`, ok: 'Remove', danger: true }))) return;
    try { if (rewrite) await Spotify.replaceItems(pl.id, keep.filter((t) => !t.local).map((t) => t.uri)); else await Spotify.removeItems(pl.id, removed.map((t) => t.uri), pl.snapshot_id); toast(`Removed ${plural(removed.length, 'song')}`, 'ok'); onDone(); }
    catch (e) { toast((e as Error).message, 'err'); }
  };
  const Row = ({ t, why }: { t: PlItem; why: React.ReactNode }) => <TrackRow t={t} check={sel.has(t.pos)} onCheck={() => toggle(t.pos)} value={why} />;
  const local = items.filter((t) => t.local).length;
  return (
    <>
      {confirmNode}
      <SectionHead title="Duplicates" note={groups.length ? `${plural(groups.length, 'song')} appear more than once. Extra copies are selected.` : undefined} />
      {groups.length ? <List>{groups.map((g) => g.map((t, i) => <Row key={t.pos} t={t} why={i === 0 ? <span className="chip">Keep</span> : `#${t.pos + 1}`} />))}</List> : <p className="muted">No duplicates. Nice and tidy.</p>}
      {H.loaded && <section className="section"><SectionHead title="Songs you usually skip" note="Skipped in at least 60% of your listens" />{skipped.length ? <List>{skipped.map((x) => <Row key={x.t.pos} t={x.t} why={`skipped ${pct(x.p.skips / x.p.ev)}`} />)}</List> : <p className="muted">You don’t skip anything here often.</p>}</section>}
      {!!local && <div style={{ marginTop: 18 }}><Note>{plural(local, 'local file')} in this playlist can't be changed by apps and will be dropped if Encore rewrites the playlist.</Note></div>}
      <div className="action-bar glass"><button className="btn primary" onClick={apply} disabled={!sel.size}><Icon name="trash" />Remove {sel.size} selected</button></div>
    </>
  );
}

function SortTab({ pl, items, onDone }: { pl: SpPlaylist; items: PlItem[]; onDone: () => void }) {
  const H = useHistory(); const [key, setKey] = useState<SortKey>('artist'); const [confirmNode, ask] = useConfirm();
  const sorted = useMemo(() => key === 'spread' ? spreadByArtist(shuffleArr(items, hashStr(pl.id)), (t) => t.mainArtist) : items.slice().sort(SORTS[key][1]!), [key, items, pl.id]);
  const opts = (Object.keys(SORTS) as SortKey[]).filter((k) => k !== 'plays' || H.loaded).map((k) => [k, SORTS[k][0]] as [SortKey, string]);
  const apply = async () => {
    const local = sorted.filter((t) => t.local).length;
    if (!(await ask({ title: 'Reorder this playlist?', text: `Encore rewrites “${pl.name}” in the new order. “Date added” resets for every song${local ? `, and ${plural(local, 'local file')} will be dropped` : ''}. Prefer to keep the original? Save as a new playlist instead.`, ok: 'Reorder' }))) return;
    try { await Spotify.replaceItems(pl.id, sorted.filter((t) => !t.local).map((t) => t.uri)); toast('Playlist reordered', 'ok'); onDone(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const v = (t: PlItem) => key === 'release' ? (t.release || '').slice(0, 4) : key === 'added' ? fmtDate(t.added) : key === 'plays' ? <><b>{fmtN(playsOf(t)?.plays || 0)}</b> plays</> : fmtDur(t.duration);
  return (
    <>
      {confirmNode}
      <div className="toolbar"><Segmented options={opts} value={key} onChange={setKey} label="Sort by" /></div>
      {key === 'spread' && <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>Mixes the order so the same artist never plays twice in a row.</p>}
      <div className="btn-row" style={{ marginBottom: 16 }}><button className="btn primary" onClick={apply}><Icon name="sort" />Apply to this playlist</button><button className="btn glass" onClick={() => useApp.getState().openSave({ tracks: sorted.filter((t) => !t.local), name: `${pl.name} · sorted by ${SORTS[key][0].toLowerCase()}` })}><Icon name="plus" />Save as a new playlist</button></div>
      <List>{sorted.slice(0, 40).map((t, i) => <TrackRow key={t.pos} t={t} rank={i + 1} value={v(t)} />)}</List>
      {sorted.length > 40 && <p className="muted" style={{ margin: 10 }}>…and {fmtN(sorted.length - 40)} more</p>}
    </>
  );
}

type SplitKey = 'decade' | 'artist' | 'added' | 'chunks';
function SplitTab({ pl, items }: { pl: SpPlaylist; items: PlItem[] }) {
  const [mode, setMode] = useState<SplitKey>('decade'); const [chunk, setChunk] = useState(50); const [confirmNode, ask] = useConfirm(); const nav = useNavigate();
  const groups = useMemo(() => {
    const list = items.filter((t) => !t.local); const m = new Map<string, PlItem[]>(); const add = (k: string, t: PlItem) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); };
    if (mode === 'decade') list.forEach((t) => { const y = parseInt(t.release); add(y ? `${Math.floor(y / 10) * 10}s` : 'Unknown year', t); });
    else if (mode === 'added') list.forEach((t) => add(t.added ? String(new Date(t.added * 1000).getFullYear()) : 'Unknown', t));
    else if (mode === 'artist') { const c = new Map<string, number>(); list.forEach((t) => c.set(t.mainArtist, (c.get(t.mainArtist) || 0) + 1)); list.forEach((t) => add(c.get(t.mainArtist)! >= 5 ? t.mainArtist : 'Everyone else', t)); }
    else for (let i = 0; i < list.length; i += chunk) m.set(`Part ${i / chunk + 1}`, list.slice(i, i + chunk));
    const e = [...m.entries()];
    if (mode === 'artist') e.sort((a, b) => Number(a[0] === 'Everyone else') - Number(b[0] === 'Everyone else') || b[1].length - a[1].length);
    else if (mode !== 'chunks') e.sort((a, b) => a[0].localeCompare(b[0]));
    return e;
  }, [items, mode, chunk]);
  const apply = async () => {
    if (!(await ask({ title: `Create ${plural(groups.length, 'playlist')}?`, text: `Each is named “${pl.name} · …” and added to your Spotify library. The original stays as it is.`, ok: 'Create' }))) return;
    let done = 0;
    try { for (const [k, g] of groups) { const p = await Spotify.createPlaylist(`${pl.name} · ${k}`, `Split from ${pl.name} with Encore`); await Spotify.addItems(p.id, g.map((t) => t.uri)); done++; } toast(`Created ${plural(done, 'playlist')}`, 'ok'); useApp.getState().bumpSpotify(); nav('/playlists'); }
    catch (e) { toast(`${(e as Error).message} (${done} created)`, 'err'); }
  };
  return (
    <>
      {confirmNode}
      <div className="toolbar">
        <Segmented<SplitKey> options={[['decade', 'By decade'], ['artist', 'By artist'], ['added', 'By year added'], ['chunks', 'Into parts']]} value={mode} onChange={setMode} label="Split" />
        {mode === 'chunks' && <label className="muted small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Songs per part<select className="input" value={chunk} onChange={(e) => setChunk(+e.target.value)}>{[25, 50, 100, 200].map((n) => <option key={n}>{n}</option>)}</select></label>}
      </div>
      {mode === 'artist' && <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>Artists with 5 or more songs get their own playlist.</p>}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))' }}>
        {groups.map(([k, g]) => <div key={k} className="card glass" style={{ padding: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b className="ellipsis">{k}</b><span className="muted small tnum">{plural(g.length, 'song')}</span></div><div className="muted small" style={{ marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{g.slice(0, 4).map((t) => t.name).join(' · ')}</div></div>)}
      </div>
      <div className="btn-row" style={{ marginTop: 18 }}><button className="btn primary" disabled={groups.length < 2} onClick={apply}><Icon name="split" />Create {plural(groups.length, 'playlist')}</button><span className="muted small">Your original playlist stays as it is.</span></div>
    </>
  );
}

export function Playlist() {
  const id = useParams().id || '';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('songs');
  const me = useSpotify(['me'], () => Spotify.me());
  const meta = useSpotify(['playlist', id], () => Spotify.playlist(id));
  const isOwn = !!(meta.data && owned(meta.data, me.data?.id));
  const items = useSpotify(['pl-items', id], () => Spotify.playlistItems(id), isOwn);
  const cover = pickImg(meta.data?.images, 640);
  useAmbient(cover);
  const H = useHistory();
  const reload = () => { invalidate('pl:' + id); invalidate('playlist:' + id); qc.invalidateQueries({ queryKey: ['sp'] }); };
  if (!Spotify.connected) return <NeedSpotify what="This playlist" />;
  if (meta.isLoading || me.isLoading) return <Loading />;
  if (meta.error || !meta.data) return <Note>{(meta.error as Error)?.message || 'Playlist not found.'}</Note>;
  const pl = meta.data; const list = items.data || [];
  const dur = list.reduce((s, t) => s + t.duration, 0);
  return (
    <>
      <div className="detail-head">
        <Art name={pl.name} img={cover} />
        <div className="detail-info">
          <div className="detail-kind">Playlist</div>
          <h1 className="detail-name">{pl.name}</h1>
          {pl.description && <div className="detail-meta" dangerouslySetInnerHTML={{ __html: pl.description }} />}
          <div className="detail-meta">{pl.owner?.display_name}{isOwn && items.data && ` · ${plural(list.length, 'song')} · ${fmtLongDur(dur)}`}</div>
          <div className="btn-row" style={{ marginTop: 6 }}>{pl.external_urls?.spotify && <a className="btn glass" href={pl.external_urls.spotify} target="_blank" rel="noopener"><Icon name="external" />Open in Spotify</a>}{isOwn && <button className="btn glass" onClick={reload}><Icon name="refresh" />Reload</button>}</div>
        </div>
      </div>
      {!isOwn ? <Note icon="lock">Spotify only lets apps read the songs in playlists you own or collaborate on. You can still open it in Spotify.</Note>
        : items.isLoading ? <Loading /> : items.error ? <Note>{(items.error as Error).message}</Note>
        : !list.length ? <Empty icon="playlists" title="This playlist is empty">Add songs in Spotify, or fill it from a smart playlist.</Empty>
        : <>
          <div className="toolbar"><Segmented<Tab> size="lg" options={[['songs', 'Songs'], ['insights', 'Insights'], ['clean', 'Clean up'], ['sort', 'Sort'], ['split', 'Split']]} value={tab} onChange={setTab} label="Playlist tools" /></div>
          {tab === 'songs' && <List>{list.map((t, i) => { const p = playsOf(t); return <TrackRow key={t.pos} t={t} rank={i + 1} value={<>{H.loaded && <><b>{fmtN(p?.plays || 0)}</b> plays · </>}{fmtDur(t.duration)}</>} />; })}</List>}
          {tab === 'insights' && <Insights items={list} />}
          {tab === 'clean' && <Clean key={list.length} pl={pl} items={list} onDone={reload} />}
          {tab === 'sort' && <SortTab pl={pl} items={list} onDone={reload} />}
          {tab === 'split' && <SplitTab pl={pl} items={list} />}
        </>}
    </>
  );
}
