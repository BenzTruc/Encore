import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ArtistTile, Empty, List, Loading, NeedHistory, NeedSpotify, Note, SectionHead, TrackRow } from '@/components/ui';
import { useApp } from '@/store/app';
import { useHistory } from '@/hooks/data';
import { liveKnownSets } from './Artists';
import { Spotify, LastFm, deepCuts } from '@/lib/spotify';
import { artistIds, seedArtist } from '@/lib/images';
import { ALL, H as HS, aggregate, forgottenArtists, forgottenLoves, topArtists, type Track } from '@/lib/history';
import { fmtDate, fmtN, spreadByArtist } from '@/lib/format';

async function seedArtists(n = 6): Promise<string[]> {
  if (HS.loaded) {
    let top = topArtists(aggregate(HS.last - 180 * 86400, HS.last + 1), n, 'ms');
    if (top.length < n) top = topArtists(ALL(), n, 'ms');
    return top.map((a) => a.name);
  }
  if (Spotify.connected) { const t = await Spotify.top('artists', 'medium_term', 20).catch(() => []); t.forEach(seedArtist); return t.slice(0, n).map((a) => a.name); }
  return [];
}
const save = (tracks: Track[], name: string) => useApp.getState().openSave({ tracks, name });

function DeepAll() {
  const [s, setS] = useState<{ loading?: string; per?: { a: string; list: Track[] }[]; err?: string }>({});
  const go = async () => {
    setS({ loading: 'Digging through albums…' });
    try {
      const seeds = await seedArtists(5); const sets = await liveKnownSets(); const per: { a: string; list: Track[] }[] = [];
      for (const a of seeds) { setS({ loading: `Digging through ${a}'s albums…` }); per.push({ a, list: await deepCuts(a, artistIds[a], sets, { maxAlbums: 4, max: 6 }).catch(() => []) }); }
      setS({ per });
    } catch (e) { setS({ err: (e as Error).message }); }
  };
  if (s.loading) return <Loading text={s.loading} />;
  if (s.err) return <Note>{s.err}</Note>;
  if (!s.per) return <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}><button className="btn tinted" onClick={go}><Icon name="disc" />Find deep cuts</button><p className="muted small">Looks through the albums of your top five artists. Takes a few seconds.</p></div>;
  const all = spreadByArtist(s.per.flatMap((p) => p.list), (t) => t.mainArtist || t.artist);
  if (!all.length) return <p className="muted">You've already heard everything we could find by your top artists.</p>;
  return (
    <>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
        {s.per.filter((p) => p.list.length).map((p) => (
          <div key={p.a} className="group glass"><Link to={`/artist/${encodeURIComponent(p.a)}`} className="col-title" style={{ color: 'inherit', margin: '8px 10px 2px' }}>{p.a}<Icon name="chevR" /></Link>
            <div className="list">{p.list.slice(0, 4).map((t) => <TrackRow key={t.uri} t={t} value={(t.release || '').slice(0, 4)} />)}</div></div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 14 }}><button className="btn primary" onClick={() => save(all, 'Deep cuts')}><Icon name="plus" />Save {all.length} songs as a playlist</button></div>
    </>
  );
}

function NewArtists() {
  const H = useHistory();
  const [s, setS] = useState<{ recs?: { name: string; because: string[] }[]; err?: string }>({});
  const [mix, setMix] = useState<{ loading?: boolean; tracks?: Track[] }>({});
  useEffect(() => {
    if (!LastFm.key) return; let alive = true;
    (async () => {
      const seeds = await seedArtists(6);
      const known = new Set<string>(); if (H.loaded) { const all = ALL(); for (let x = 0; x < H.artists.length; x++) if (all.artPlays[x] >= 3) known.add(H.artists[x].toLowerCase()); }
      seeds.forEach((x) => known.add(x.toLowerCase()));
      if (Spotify.connected && !H.loaded) (await Spotify.top('artists', 'long_term', 50).catch(() => [])).forEach((a) => known.add(a.name.toLowerCase()));
      const score = new Map<string, { name: string; score: number; because: string[] }>();
      const res = await Promise.all(seeds.map((x) => LastFm.similar(x, 30).then((l) => ({ x, l })).catch(() => ({ x, l: [] as { name: string; match: number }[] }))));
      res.forEach(({ x, l }, si) => l.forEach((a) => { if (known.has(a.name.toLowerCase())) return; const c = score.get(a.name) || { name: a.name, score: 0, because: [] }; c.score += a.match * (1 - si * 0.08); c.because.push(x); score.set(a.name, c); }));
      if (alive) setS({ recs: [...score.values()].sort((p, q) => q.score - p.score).slice(0, 18) });
    })().catch((e) => alive && setS({ err: e.message }));
    return () => { alive = false; };
  }, [H, H.n]);
  if (!LastFm.key) return <Note>Add a free Last.fm API key in <Link to="/settings">Settings</Link> to get new artists picked from the ones you love.</Note>;
  if (s.err) return <Note>{s.err}</Note>;
  if (!s.recs) return <Loading text="Asking Last.fm…" />;
  if (!s.recs.length) return <p className="muted">Last.fm had no new suggestions. You may have heard them all.</p>;
  const build = async () => {
    setMix({ loading: true });
    const lists = await Promise.all(s.recs!.slice(0, 15).map((a) => LastFm.topTracks(a.name, 2).catch(() => [])));
    setMix({ tracks: spreadByArtist(lists.flat().map((t) => ({ name: t.name, artist: t.artist, mainArtist: t.artist, album: '', uri: '' })), (t) => t.artist) });
  };
  return (
    <>
      <div className="grid-tiles" style={{ ['--tile' as string]: '136px' }}>{s.recs.map((r) => <ArtistTile key={r.name} name={r.name} sub={`Like ${r.because.slice(0, 2).join(' & ')}`} />)}</div>
      <div className="btn-row" style={{ marginTop: 16 }}><button className="btn primary" onClick={build} disabled={mix.loading}><Icon name="wand" />Build a discovery playlist</button></div>
      {mix.loading && <Loading text="Picking each artist's best-known songs…" />}
      {mix.tracks && <div style={{ marginTop: 14 }}>
        <List>{mix.tracks.map((t, i) => <TrackRow key={i} t={t} rank={i + 1} />)}</List>
        <div className="btn-row" style={{ marginTop: 12 }}>{Spotify.connected ? <button className="btn primary" onClick={() => save(mix.tracks!, 'Discovery mix')}><Icon name="plus" />Save to Spotify</button> : <Link className="btn glass" to="/settings">Connect Spotify to save this</Link>}</div>
      </div>}
    </>
  );
}

export default function Discover() {
  const H = useHistory();
  const head = <div className="page-head"><div><h1 className="large-title">Discover</h1><p className="page-sub">New and rediscovered music, picked from what you actually play.</p></div></div>;
  if (!H.loaded && !Spotify.connected) return <>{head}<NeedHistory what="your suggestions" /></>;
  const fl = H.loaded ? forgottenLoves(40) : []; const fa = H.loaded ? forgottenArtists(12) : [];
  const v = (t: Track) => <><b>{fmtN(t.plays!)}</b> plays · last {fmtDate(t.last!, { month: 'short', year: 'numeric' })}</>;
  return (
    <>
      {head}
      <section className="section" style={{ marginTop: 0 }}>
        <SectionHead title="Rediscover forgotten loves" note={H.loaded ? 'Songs you played a lot, then stopped' : undefined} />
        {!H.loaded ? <Empty icon="history" title="Needs your listening history" actions={<Link className="btn glass" to="/settings">Import history</Link>}>Forgotten favorites come from your lifetime history. Import it when Spotify emails it to you.</Empty>
          : fl.length ? <>
            <div className="cols"><List>{fl.slice(0, 6).map((t) => <TrackRow key={t.i} t={t} value={v(t)} />)}</List><List>{fl.slice(6, 12).map((t) => <TrackRow key={t.i} t={t} value={v(t)} />)}</List></div>
            <div className="btn-row" style={{ marginTop: 12 }}><button className="btn primary" onClick={() => save(fl, 'Forgotten favorites')}><Icon name="plus" />Save {fl.length} songs as a playlist</button></div>
          </> : <p className="muted">Nothing forgotten yet. You keep coming back to your favorites.</p>}
        {!!fa.length && <><h3 className="col-title" style={{ marginTop: 26 }}>Artists you drifted away from</h3><div className="shelf artists">{fa.map((a) => <ArtistTile key={a.name} name={a.name} sub={`${fmtN(a.plays)} plays back then`} />)}</div></>}
      </section>
      <section className="section"><SectionHead title="Deep cuts from your favorites" note="Album tracks by your top artists you’ve never played" />{Spotify.connected ? <DeepAll /> : <NeedSpotify what="Finding deep cuts" />}</section>
      <section className="section"><SectionHead title="New artists for you" note="Similar to your favorites, via Last.fm" /><NewArtists /></section>
    </>
  );
}
