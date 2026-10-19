import { useMemo, useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { Art, ArtistTile, Empty, List, Loading, NeedHistory, Note, SectionHead, Segmented, Stat, TrackRow } from '@/components/ui';
import { BarChart } from '@/charts/Charts';
import { useApp } from '@/store/app';
import { useAmbient, useHistory, useSpotify } from '@/hooks/data';
import { Spotify, LastFm, deepCuts, pickImg, type PlayedSets } from '@/lib/spotify';
import { artistIds, cachedImage, seedArtist } from '@/lib/images';
import { ALL, H as HS, artistDetail, dayToSec, type Track } from '@/lib/history';
import { fmtDate, fmtHours, fmtLongDur, fmtN, normTitle, pct } from '@/lib/format';

type Sort = 'plays' | 'new' | 'az';

export function Artists() {
  const H = useHistory();
  const [q, setQ] = useState(''); const [sort, setSort] = useState<Sort>('plays');
  const live = useSpotify(['artists-all'], async () => {
    const lists = await Promise.all(['short_term', 'medium_term', 'long_term'].map((r) => Spotify.top('artists', r, 50).catch(() => [])));
    const m = new Map<string, { name: string; img: string; sub: string }>();
    lists.flat().forEach((a) => { seedArtist(a); if (!m.has(a.name)) m.set(a.name, { name: a.name, img: pickImg(a.images, 300), sub: a.genres?.[0] || '' }); });
    return [...m.values()];
  }, !H.loaded);
  const rows = useMemo(() => {
    if (!H.loaded) return [];
    const all = ALL(); const r: { name: string; plays: number; ms: number; first: number }[] = [];
    for (let x = 0; x < H.artists.length; x++) if (all.artPlays[x] >= 2) r.push({ name: H.artists[x], plays: all.artPlays[x], ms: all.artMs[x], first: H.artistFirst[x] >= 0 ? H.ts[H.artistFirst[x]] : 0 });
    return r;
  }, [H, H.n]);
  if (!H.loaded && !Spotify.connected) return <><h1 className="large-title" style={{ marginBottom: 20 }}>Artists</h1><NeedHistory what="your artists" /></>;
  const ql = q.trim().toLowerCase();
  let list: { name: string; sub: string; img?: string }[];
  if (H.loaded) {
    const sorted = rows.slice().sort(sort === 'new' ? (a, b) => b.first - a.first : sort === 'az' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.ms - a.ms);
    list = sorted.filter((r) => !ql || r.name.toLowerCase().includes(ql)).map((r) => ({ name: r.name, sub: sort === 'new' ? `Since ${fmtDate(r.first, { month: 'short', year: 'numeric' })}` : `${fmtN(r.plays)} plays · ${fmtHours(r.ms)} h` }));
  } else list = (live.data || []).filter((r) => !ql || r.name.toLowerCase().includes(ql));
  const shown = list.slice(0, 240);
  return (
    <>
      <div className="page-head"><div><h1 className="large-title">Artists</h1><p className="page-sub">{H.loaded ? `${fmtN(rows.length)} artists you've played more than once` : 'Your top artists from Spotify'}</p></div></div>
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input className="input glass flat" type="search" placeholder="Search artists" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search artists" /></div>
        {H.loaded && <Segmented<Sort> options={[['plays', 'Most played'], ['new', 'Newest'], ['az', 'A–Z']]} value={sort} onChange={setSort} label="Sort" />}
      </div>
      {live.isLoading && <Loading />}
      {!shown.length && !live.isLoading ? <p className="muted">No artists match “{q}”.</p> : <div className="grid-tiles" style={{ ['--tile' as string]: '138px' }}>{shown.map((r) => <ArtistTile key={r.name} name={r.name} sub={r.sub} img={r.img} />)}</div>}
      {list.length > shown.length && <p className="muted" style={{ marginTop: 16 }}>Showing {fmtN(shown.length)} of {fmtN(list.length)}. Search to find the rest.</p>}
    </>
  );
}

/* ---------------- Artist detail ---------------- */
function playedSets(): PlayedSets {
  const uris = new Set<string>(), names = new Set<string>();
  if (HS.loaded) { const all = ALL(); for (let t = 0; t < HS.tCount; t++) if (all.trPlays[t]) { if (HS.tUri[t]) uris.add(HS.tUri[t]); names.add(normTitle(HS.tName[t]) + '|' + HS.artists[HS.tArtist[t]].toLowerCase()); } }
  return { uris, names };
}
export async function liveKnownSets(): Promise<PlayedSets> {
  const sets = playedSets();
  if (!HS.loaded) {
    const lists = await Promise.all([...['short_term', 'medium_term', 'long_term'].map((r) => Spotify.top('tracks', r, 50).catch(() => [])), Spotify.recent().then((r) => r.map((x) => x.track)).catch(() => [])]);
    lists.flat().filter(Boolean).forEach((t) => { sets.uris.add(t.uri); sets.names.add(normTitle(t.name) + '|' + (t.artists?.[0]?.name || '').toLowerCase()); });
  }
  return sets;
}

function DeepCutsBlock({ name }: { name: string }) {
  const [state, setState] = useState<{ loading?: boolean; list?: Track[]; err?: string }>({});
  const go = async () => {
    setState({ loading: true });
    try { setState({ list: await deepCuts(name, artistIds[name], await liveKnownSets(), { maxAlbums: 8, max: 40 }) }); }
    catch (e) { setState({ err: (e as Error).message }); }
  };
  if (state.loading) return <Loading text={`Looking through ${name}'s albums…`} />;
  if (state.err) return <Note>{state.err}</Note>;
  if (!state.list) return <button className="btn tinted" onClick={go}><Icon name="disc" />Find deep cuts</button>;
  if (!state.list.length) return <p className="muted">You've already played everything we could find by {name}. Impressive.</p>;
  return (
    <>
      <List>{state.list.slice(0, 20).map((t) => <TrackRow key={t.uri} t={t} value={(t.release || '').slice(0, 4)} />)}</List>
      <div className="btn-row" style={{ marginTop: 12 }}><button className="btn primary" onClick={() => useApp.getState().openSave({ tracks: state.list!, name: `Deep cuts · ${name}` })}><Icon name="plus" />Save {state.list.length} songs as a playlist</button></div>
    </>
  );
}
function Similar({ name }: { name: string }) {
  const H = useHistory();
  const [state, setState] = useState<{ list?: { name: string; match: number }[]; err?: string }>({});
  useEffect(() => { if (!LastFm.key) return; let alive = true; setState({}); LastFm.similar(name, 18).then((list) => alive && setState({ list }), (e) => alive && setState({ err: e.message })); return () => { alive = false; }; }, [name]);
  if (!LastFm.key) return <Note>Add a free Last.fm API key in <Link to="/settings">Settings</Link> to see artists like {name}.</Note>;
  if (state.err) return <Note>{state.err}</Note>;
  if (!state.list) return <Loading text="Asking Last.fm…" />;
  if (!state.list.length) return <p className="muted">Last.fm has no similar artists for {name}.</p>;
  const all = H.loaded ? ALL() : null;
  return <div className="shelf artists">{state.list.map((s) => { const x = H.artistIndex.get(s.name); const plays = all && x !== undefined ? all.artPlays[x] : 0; return <ArtistTile key={s.name} name={s.name} sub={plays ? `${fmtN(plays)} plays` : 'New to you'} />; })}</div>;
}

export function Artist() {
  const name = decodeURIComponent(useParams().name || '');
  const H = useHistory();
  const [allSongs, setAllSongs] = useState(false);
  const d = useMemo(() => (H.loaded ? artistDetail(name) : null), [H, H.n, name]);
  const sp = useSpotify(['artist', name], async () => { const id = artistIds[name] || (await Spotify.findArtist(name))?.id; if (!id) return null; const a = await Spotify.artist(id); seedArtist(a); return a; });
  const img = sp.data ? pickImg(sp.data.images, 640) : cachedImage('artist', name);
  useAmbient(img);
  if (!d && !sp.data) return sp.isLoading ? <Loading /> : <Empty icon="artists" title="Artist not found">{H.loaded ? `“${name}” isn't in your listening history.` : 'Connect Spotify or import your history to see artist pages.'}</Empty>;
  const open = useApp.getState();
  const series = d ? d.series.map((s) => ({ label: s.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), short: s.date.getMonth() === 0 ? String(s.date.getFullYear()) : '', value: s.plays, tip: `${s.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}\n${fmtN(s.plays)} plays · ${fmtN(s.ms / 60000)} min` })) : [];
  return (
    <>
      <div className="detail-head">
        <Art name={name} img={img} kind="artist" k={name} round />
        <div className="detail-info">
          <div className="detail-kind">Artist</div>
          <h1 className="detail-name">{name}</h1>
          {d && <div className="detail-meta">#{d.rank} all time · {fmtN(d.plays)} plays · {fmtHours(d.ms)} hours</div>}
          {!!sp.data?.genres?.length && <div className="chips">{sp.data.genres.slice(0, 5).map((g) => <span key={g} className="chip">{g}</span>)}</div>}
          <div className="btn-row" style={{ marginTop: 6 }}>
            {d && <button className="btn primary" onClick={() => open.openGenerator({ template: 'artist', artists: [name] })}><Icon name="wand" />Playlist of my favorites</button>}
            {d && <button className="btn glass" onClick={() => open.openShare({ eyebrow: 'My artist', period: d.first ? `Since ${new Date(d.first.t * 1000).getFullYear()}` : '', image: cachedImage('artist', name), round: true, title: name, line: `${fmtN(d.plays)} plays · ${fmtHours(d.ms)} hours · #${d.rank} of all my artists` })}><Icon name="share" />Share</button>}
            {sp.data?.external_urls?.spotify && <a className="btn glass" href={sp.data.external_urls.spotify} target="_blank" rel="noopener"><Icon name="external" />Open in Spotify</a>}
          </div>
        </div>
      </div>
      {d && <>
        <div className="stats">
          <Stat k="First listen" v={d.first ? fmtDate(d.first.t) : '–'} d={d.first ? `“${d.first.track}”` : ''} sm />
          <Stat k="Last played" v={d.last ? fmtDate(d.last) : '–'} sm />
          <Stat k="Share of your listening" v={pct(d.share, 1)} />
          <Stat k="Songs played" v={fmtN(d.tracks.filter((t) => t.plays).length)} />
          {!H.meta?.basicOnly && <Stat k="Skip rate" v={pct(d.skipRate)} />}
          {d.bestDay && <Stat k="Biggest day together" v={fmtLongDur(d.bestDay.ms)} d={fmtDate(dayToSec(d.bestDay.day))} sm />}
        </div>
        <section className="section"><SectionHead title="Your plays over time" /><div className="card glass"><BarChart items={series.map((s) => ({ ...s, short: series.length <= 24 ? s.label.split(' ')[0] : s.short }))} height={190} labelEvery={series.length <= 24 ? Math.ceil(series.length / 8) : 1} fmt={fmtN} /></div></section>
        <section className="section"><div className="cols">
          <div><div className="col-title">Your top songs</div><List>{d.tracks.slice(0, allSongs ? 100 : 10).map((t, i) => <TrackRow key={t.i} t={t} rank={i + 1} value={<><b>{fmtN(t.plays!)}</b> plays</>} />)}</List>
            {d.tracks.length > 10 && <button className="btn sm glass" style={{ marginTop: 10 }} onClick={() => setAllSongs(!allSongs)}>{allSongs ? 'Show fewer' : `Show all ${fmtN(Math.min(100, d.tracks.length))}`}</button>}</div>
          <div><div className="col-title">Albums you play</div><List>{d.albums.slice(0, 10).map((al) => <div key={al.name} className="row no-rank"><Art name={al.name} kind="track" k={al.key} size="sm" /><div style={{ minWidth: 0 }}><div className="t">{al.name}</div><div className="s">{al.tracks} {al.tracks === 1 ? 'song' : 'songs'} played</div></div><div className="v"><b>{fmtN(al.plays)}</b> plays</div></div>)}</List></div>
        </div></section>
      </>}
      {Spotify.connected && <section className="section"><SectionHead title="Deep cuts" note={`Songs by ${name} you haven’t played`} /><DeepCutsBlock key={name} name={name} /></section>}
      <section className="section"><SectionHead title="Similar artists" note="From Last.fm" /><Similar name={name} /></section>
    </>
  );
}
