import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ArtistTile, Loading, Note, SectionHead, TrackRow, TrackTile, List } from '@/components/ui';
import { useAmbient, useHistory, useSpotify } from '@/hooks/data';
import { Spotify, liveTrack, pickImg } from '@/lib/spotify';
import { seedArtist, cachedImage } from '@/lib/images';
import { aggregate, periodRange, topArtists, topTracks } from '@/lib/history';
import { agoText, fmtHours, fmtN, plural } from '@/lib/format';

function Welcome() {
  return (
    <>
      <div className="page-head"><div><h1 className="large-title">Welcome to Encore</h1><p className="page-sub">Your Spotify listening, laid out beautifully. Two quick steps get you started.</p></div></div>
      <div className="hero glass">
        <div className="hero-eyebrow">Everything about your music</div>
        <div className="hero-big" style={{ fontSize: 'clamp(34px,6vw,58px)', letterSpacing: '-0.03em' }}>Charts. Habits. Wrapped, any time.</div>
        <p className="hero-line">Top artists and songs over any week, month or year. When you listen and what you skip. Artist deep-dives, playlist tools and new music picked from what you actually play.</p>
      </div>
      <div className="cards" style={{ marginTop: 16 }}>
        {[
          { icon: 'spotify' as const, color: '#1db954', title: '1 · Connect Spotify', text: 'Create a free Spotify developer app (five minutes, guided), then log in. Unlocks top lists, recently played, artwork and playlist tools.', cta: 'Set up' },
          { icon: 'history' as const, color: '#ff375f', title: '2 · Import your history', text: "When Spotify's email with your extended streaming history arrives, drop the .zip in. Unlocks lifetime stats, Wrapped and milestones.", cta: 'How to get it' },
        ].map((c) => (
          <Link key={c.title} to="/settings" className="card glass" style={{ color: 'inherit', textDecoration: 'none', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="tl-ic" style={{ background: c.color }}><Icon name={c.icon} /></span><h3>{c.title}</h3></div>
            <p className="muted">{c.text}</p>
            <span className="link-btn">{c.cta}<Icon name="chevR" /></span>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function Home() {
  const H = useHistory();
  const live = Spotify.connected;
  const topA = useSpotify(['top', 'artists', 'short_term'], () => Spotify.top('artists', 'short_term', 20));
  const topT = useSpotify(['top', 'tracks', 'short_term'], () => Spotify.top('tracks', 'short_term', 20));
  const recent = useSpotify(['recent'], () => Spotify.recent());
  topA.data?.forEach(seedArtist);

  // hero data
  const year = H.loaded ? new Date(H.last * 1000).getFullYear() : 0;
  const agg = H.loaded ? aggregate(...periodRange({ kind: 'year', y: year })) : null;
  const heroArtist = agg ? topArtists(agg, 1, 'ms')[0] : null;
  const a0 = topA.data?.[0];
  const ambient = heroArtist ? cachedImage('artist', heroArtist.name) : a0 ? pickImg(a0.images, 640) : '';
  useAmbient(ambient);

  if (!live && !H.loaded) return <Welcome />;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const recent30 = H.loaded ? aggregate(H.last - 30 * 86400, H.last + 1) : null;

  return (
    <>
      <div className="page-head"><div><h1 className="large-title">Home</h1><p className="page-sub">{today}</p></div></div>
      {live && !H.loaded && <div style={{ marginBottom: 14 }}><Note icon="history">Requested your full history from Spotify? When the email arrives, <Link to="/settings">import the .zip</Link> to unlock lifetime charts, habits, skips, Wrapped and milestones.</Note></div>}
      {H.loaded && !live && <div style={{ marginBottom: 14 }}><Note icon="spotify"><Link to="/settings">Connect Spotify</Link> to add artwork, manage playlists, save generated playlists and get fresh top lists.</Note></div>}

      {agg ? (
        <div className="hero glass">
          {ambient && <div className="bg on" style={{ backgroundImage: `url("${ambient}")` }} />}
          <div className="hero-row">
            <div>
              <div className="hero-eyebrow">{year === new Date().getFullYear() ? `${year} so far` : `Your ${year}`} · from your history</div>
              <div className="hero-big">{fmtN(agg.ms / 60000)}<small>minutes</small></div>
              {heroArtist && <p className="hero-line">Mostly {heroArtist.name}, with {plural(agg.uniqArtists, 'artist')} and {plural(agg.uniqTracks, 'song')} along the way.</p>}
            </div>
            <div className="hero-stats">
              <div><b>{fmtN(agg.plays)}</b><span>streams</span></div>
              <div><b>{fmtN(agg.days)}</b><span>days listening</span></div>
              <div><b>{fmtHours(agg.ms / Math.max(1, agg.days))}</b><span>hours a day</span></div>
            </div>
          </div>
        </div>
      ) : a0 ? (
        <div className="hero glass">
          <div className="bg on" style={{ backgroundImage: `url("${pickImg(a0.images, 640)}")` }} />
          <div className="hero-row">
            <div><div className="hero-eyebrow">Your #1 artist · last 4 weeks</div><div className="hero-big" style={{ fontSize: 'clamp(40px,7vw,68px)' }}>{a0.name}</div>{!!a0.genres?.length && <p className="hero-line">{a0.genres.slice(0, 3).join(' · ')}</p>}</div>
            <Link className="btn glass" to={`/artist/${encodeURIComponent(a0.name)}`}>See artist<Icon name="chevR" /></Link>
          </div>
        </div>
      ) : topA.isLoading ? <Loading /> : null}

      <div className="promos">
        <Link className="promo wrapped" to="/wrapped"><div className="p-eyebrow">Wrapped, whenever</div><div><div className="p-title">{year ? `Your ${year} story` : 'Your story'}</div><div className="p-sub">Tap through your year or any month.</div></div></Link>
        <Link className="promo miles" to="/milestones"><div className="p-eyebrow">Milestones</div><div><div className="p-title">Moments that mattered</div><div className="p-sub">First plays, records and streaks.</div></div></Link>
        <Link className="promo disc" to="/discover"><div className="p-eyebrow">Discover</div><div><div className="p-title">Find your next favorite</div><div className="p-sub">Forgotten loves, deep cuts, new artists.</div></div></Link>
      </div>

      {topA.data?.length ? (
        <section className="section"><SectionHead title="Top artists · last 4 weeks" to="/charts" />
          <div className="shelf artists">{topA.data.slice(0, 12).map((a) => <ArtistTile key={a.id} name={a.name} img={pickImg(a.images, 300)} sub={a.genres?.[0]} />)}</div></section>
      ) : recent30 && (
        <section className="section"><SectionHead title="Top artists · your last 30 days" to="/charts" />
          <div className="shelf artists">{topArtists(recent30, 12, 'ms').map((a) => <ArtistTile key={a.name} name={a.name} sub={`${fmtN(a.plays)} plays`} />)}</div></section>
      )}

      {topT.data?.length ? (
        <section className="section"><SectionHead title="On repeat · last 4 weeks" to="/charts" />
          <div className="cols">{[0, 5].map((s) => <List key={s}>{topT.data!.slice(s, s + 5).map(liveTrack).map((t, i) => <TrackRow key={t.uri} t={t} rank={s + i + 1} to={`/artist/${encodeURIComponent(t.mainArtist)}`} />)}</List>)}</div></section>
      ) : recent30 && (
        <section className="section"><SectionHead title="On repeat · your last 30 days" to="/charts" />
          <div className="cols">{[0, 5].map((s) => <List key={s}>{topTracks(recent30, 10).slice(s, s + 5).map((t, i) => <TrackRow key={t.i} t={t} rank={s + i + 1} value={<><b>{fmtN(t.plays!)}</b> plays</>} />)}</List>)}</div></section>
      )}

      {!!recent.data?.length && (
        <section className="section"><SectionHead title="Recently played" />
          <div className="shelf">{(() => { const seen = new Set<string>(); return recent.data!.filter((r) => r.track && !seen.has(r.track.uri) && seen.add(r.track.uri)).slice(0, 16).map((r) => { const t = liveTrack(r.track); return <TrackTile key={t.uri} t={t} sub={`${t.mainArtist} · ${agoText(Date.parse(r.played_at))}`} to={`/artist/${encodeURIComponent(t.mainArtist)}`} />; }); })()}</div></section>
      )}
    </>
  );
}
