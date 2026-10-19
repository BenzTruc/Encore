import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { Art, List, NeedHistory, SectionHead, Segmented } from '@/components/ui';
import { CountUp, storyBg } from '@/components/Overlays';
import { ClockChart } from '@/charts/Charts';
import { useApp, toast, type Story } from '@/store/app';
import { useHistory } from '@/hooks/data';
import { Spotify, liveTrack, pickImg, type SpArtist } from '@/lib/spotify';
import { cachedImage, seedArtist } from '@/lib/images';
import { LIVE_RANGES } from '@/lib/constants';
import { aggregate, dayToSec, milestones, periodHasData, periodRange, topArtists, trackKey, wrappedData, yearsInData, type Period, type Track, type Wrapped as W } from '@/lib/history';
import { MONTHS, MONTHS_LONG, fmtDate, fmtHour, fmtLongDur, fmtN, hashStr, pct, plural } from '@/lib/format';

const Li = ({ i, name, sub, art }: { i: number; name: string; sub: string; art: ReactNode }) => (
  <div className="st-li"><span className="n">{i}</span>{art}<div style={{ minWidth: 0 }}><div className="tt">{name}</div><div className="ss">{sub}</div></div></div>
);
const aImg = (n: string) => cachedImage('artist', n) || '';
const tImg = (t: Track) => cachedImage('track', trackKey(t)) || '';

function wrappedSlides(d: W): Story['slides'] {
  const label = d.label, isYear = d.p.kind === 'year', unit = isYear ? 'year' : 'month';
  const slides: Story['slides'] = [];
  slides.push({ bg: 0, node: <><div className="st-eyebrow">Encore Wrapped</div><div className="st-title" style={{ fontSize: 'clamp(44px,12vw,68px)' }}>Your {label} in music</div><div className="st-text">{plural(d.uniqArtists, 'artist')}. {plural(d.uniqTracks, 'song')}. Let's look back.</div></>, share: { eyebrow: 'Encore Wrapped', period: label, big: d.p.kind === 'year' ? String(d.p.y) : d.p.kind === 'month' ? MONTHS[d.p.m] : label, bigSize: 240, line: `${plural(d.uniqArtists, 'artist')} · ${plural(d.uniqTracks, 'song')}`, theme: 0 } });
  const prevTxt = d.prevMs ? ` That's ${pct(Math.abs(d.ms - d.prevMs) / d.prevMs)} ${d.ms >= d.prevMs ? 'more' : 'less'} than the ${unit} before.` : '';
  slides.push({ bg: 1, node: <><div className="st-eyebrow">You listened for</div><div className="st-big"><CountUp to={Math.round(d.ms / 60000)} /></div><div className="st-title" style={{ fontSize: 30 }}>minutes</div><div className="st-text">About {fmtN(d.ms / 3600000)} hours, on {plural(d.days, 'day')}.{prevTxt}</div></>, share: { eyebrow: 'I listened for', period: label, big: fmtN(d.ms / 60000), unit: 'minutes', line: `${fmtN(d.ms / 3600000)} hours on ${plural(d.days, 'day')}`, theme: 1 } });
  const a0 = d.artists[0];
  if (a0) slides.push({ bg: 2, node: <><Art name={a0.name} img={aImg(a0.name)} kind="artist" k={a0.name} round className="st-art" /><div className="st-eyebrow">Your top artist</div><div className="st-title">{a0.name}</div><div className="st-text">{fmtN(a0.ms / 60000)} minutes together across {plural(a0.plays, 'play')}.{d.topArtistSince ? ` You first played them in ${new Date(d.topArtistSince * 1000).getFullYear()}.` : ''}</div></>, share: { eyebrow: 'My top artist', period: label, image: aImg(a0.name), round: true, title: a0.name, line: `${fmtN(a0.ms / 60000)} minutes · ${plural(a0.plays, 'play')}`, theme: 2 } });
  if (d.artists.length > 1) slides.push({ bg: 3, node: <><div className="st-eyebrow">Your top artists</div><div className="st-list">{d.artists.map((a, i) => <Li key={a.name} i={i + 1} name={a.name} sub={`${fmtN(a.ms / 60000)} min`} art={<Art name={a.name} img={aImg(a.name)} kind="artist" k={a.name} round />} />)}</div></>, share: { eyebrow: 'My top artists', period: label, items: d.artists.map((a) => ({ name: a.name, sub: `${fmtN(a.ms / 60000)} minutes`, image: aImg(a.name) })), roundItems: true, theme: 3 } });
  const t0 = d.tracks[0];
  if (t0) slides.push({ bg: 4, node: <><Art name={t0.album || t0.name} img={tImg(t0)} kind="track" k={trackKey(t0)} className="st-art" /><div className="st-eyebrow">Your song of the {unit}</div><div className="st-title">{t0.name}</div><div className="st-text">{t0.artist} · {plural(t0.plays!, 'play')}.{d.topSongDay && d.topSongDay.n > 1 ? ` On ${fmtDate(dayToSec(d.topSongDay.d), { day: 'numeric', month: 'long' })} alone you played it ${d.topSongDay.n} times.` : ''}</div></>, share: { eyebrow: `My song of the ${unit}`, period: label, image: tImg(t0), title: t0.name, line: `${t0.artist} · ${plural(t0.plays!, 'play')}`, theme: 4 } });
  if (d.tracks.length > 1) slides.push({ bg: 5, node: <><div className="st-eyebrow">Your top songs</div><div className="st-list">{d.tracks.map((t, i) => <Li key={t.i} i={i + 1} name={t.name} sub={`${t.artist} · ${fmtN(t.plays!)} plays`} art={<Art name={t.album || t.name} img={tImg(t)} kind="track" k={trackKey(t)} />} />)}</div></>, share: { eyebrow: 'My top songs', period: label, items: d.tracks.map((t) => ({ name: t.name, sub: `${t.artist} · ${fmtN(t.plays!)} plays`, image: tImg(t) })), theme: 0 } });
  slides.push({ bg: 6, node: <><div style={{ fontSize: 60, lineHeight: 1 }}><Icon name={d.persona.icon as IconName} /></div><div className="st-eyebrow">Your listening type</div><div className="st-title">{d.persona.title}</div><div className="st-text">{d.persona.text} Your peak hour was {fmtHour(d.persona.peak)}.</div><div style={{ maxWidth: 220 }}><ClockChart hours={d.hours} size={220} mono /></div></>, share: { eyebrow: 'My listening type', period: label, big: d.persona.title, bigSize: 130, line: `${d.persona.text} Peak hour: ${fmtHour(d.persona.peak)}.`, theme: 3 } });
  if (d.newArtists) slides.push({ bg: 7, node: <><div className="st-eyebrow">You discovered</div><div className="st-big"><CountUp to={d.newArtists} /></div><div className="st-title" style={{ fontSize: 30 }}>new artists</div>{d.bestNew && <div className="st-text">Your favorite new find was <b>{d.bestNew.name}</b>, with {plural(d.bestNew.plays, 'play')}.</div>}</>, share: { eyebrow: 'I discovered', period: label, big: fmtN(d.newArtists), unit: 'new artists', line: d.bestNew ? `Best new find: ${d.bestNew.name}` : '', theme: 2 } });
  if (d.bigDay) slides.push({ bg: 1, node: <><div className="st-eyebrow">Your biggest day</div><div className="st-title">{fmtDate(dayToSec(d.bigDay.d), { weekday: 'long', day: 'numeric', month: 'long' })}</div><div className="st-big" style={{ fontSize: 'clamp(44px,12vw,72px)' }}>{fmtLongDur(d.bigDay.ms)}</div>{d.bigDayTop && <div className="st-text">On repeat that day: “{d.bigDayTop.name}” by {d.bigDayTop.artist}.</div>}</>, share: { eyebrow: 'My biggest listening day', period: label, title: fmtDate(dayToSec(d.bigDay.d), { weekday: 'long', day: 'numeric', month: 'long' }), line: `${fmtLongDur(d.bigDay.ms)} of music${d.bigDayTop ? ` · on repeat: ${d.bigDayTop.name}` : ''}`, theme: 1 } });
  slides.push({ bg: 2, node: <><div className="st-eyebrow">{label} · Encore Wrapped</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 14px', marginTop: 8 }}>
      <div><div className="st-eyebrow" style={{ fontSize: 12 }}>Top artists</div>{d.artists.slice(0, 5).map((a, i) => <div key={a.name} className="ellipsis" style={{ fontWeight: 700, fontSize: 15 }}>{i + 1} {a.name}</div>)}</div>
      <div><div className="st-eyebrow" style={{ fontSize: 12 }}>Top songs</div>{d.tracks.slice(0, 5).map((t, i) => <div key={t.i} className="ellipsis" style={{ fontWeight: 700, fontSize: 15 }}>{i + 1} {t.name}</div>)}</div>
      <div><div className="st-eyebrow" style={{ fontSize: 12 }}>Minutes</div><div className="st-big" style={{ fontSize: 40 }}>{fmtN(d.ms / 60000)}</div></div>
      <div><div className="st-eyebrow" style={{ fontSize: 12 }}>Type</div><div style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>{d.persona.title}</div></div>
    </div></>, share: { eyebrow: 'My Wrapped', period: label, items: d.artists.slice(0, 5).map((a) => ({ name: a.name, sub: `${fmtN(a.ms / 60000)} minutes`, image: aImg(a.name) })), roundItems: true, theme: 4 } });
  return slides;
}

function liveSlides(label: string, ta: SpArtist[], tt: ReturnType<typeof liveTrack>[]): Story['slides'] {
  const g = new Map<string, number>(); ta.forEach((a, i) => (a.genres || []).forEach((x) => g.set(x, (g.get(x) || 0) + (20 - i))));
  const genres = [...g.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map((x) => x[0]);
  const a0 = ta[0]; const s: Story['slides'] = [];
  s.push({ bg: 0, node: <><div className="st-eyebrow">Encore snapshot</div><div className="st-title" style={{ fontSize: 'clamp(40px,11vw,62px)' }}>Your music, {label.toLowerCase()}</div><div className="st-text">Straight from Spotify. Tap to begin.</div></>, share: { eyebrow: 'Encore snapshot', period: label, big: '♪', bigSize: 240, line: 'My music right now', theme: 0 } });
  s.push({ bg: 2, node: <><Art name={a0.name} img={pickImg(a0.images, 640)} round className="st-art" /><div className="st-eyebrow">Your top artist</div><div className="st-title">{a0.name}</div>{!!a0.genres?.length && <div className="st-text">{a0.genres.slice(0, 3).join(' · ')}</div>}</>, share: { eyebrow: 'My top artist', period: label, image: pickImg(a0.images, 640), round: true, title: a0.name, line: a0.genres?.slice(0, 3).join(' · ') || '', theme: 2 } });
  s.push({ bg: 3, node: <><div className="st-eyebrow">Your top artists</div><div className="st-list">{ta.slice(0, 5).map((a, i) => <Li key={a.id} i={i + 1} name={a.name} sub={a.genres?.[0] || ''} art={<Art name={a.name} img={pickImg(a.images, 160)} round />} />)}</div></>, share: { eyebrow: 'My top artists', period: label, items: ta.slice(0, 5).map((a) => ({ name: a.name, sub: a.genres?.[0] || '', image: pickImg(a.images, 300) })), roundItems: true, theme: 3 } });
  if (tt[0]) s.push({ bg: 4, node: <><Art name={tt[0].album} img={tt[0].img} className="st-art" /><div className="st-eyebrow">Your top song</div><div className="st-title">{tt[0].name}</div><div className="st-text">{tt[0].artist}</div></>, share: { eyebrow: 'My top song', period: label, image: tt[0].img, title: tt[0].name, line: tt[0].artist, theme: 4 } });
  if (tt.length > 1) s.push({ bg: 5, node: <><div className="st-eyebrow">Your top songs</div><div className="st-list">{tt.slice(0, 5).map((t, i) => <Li key={t.uri} i={i + 1} name={t.name} sub={t.artist} art={<Art name={t.album} img={t.img} />} />)}</div></>, share: { eyebrow: 'My top songs', period: label, items: tt.slice(0, 5).map((t) => ({ name: t.name, sub: t.artist, image: t.img })), theme: 1 } });
  if (genres.length) s.push({ bg: 6, node: <><div className="st-eyebrow">Your sound</div><div style={{ display: 'grid', gap: 6 }}>{genres.map((x, i) => <div key={x} className="st-title" style={{ fontSize: Math.max(24, 46 - i * 5), opacity: 1 - i * 0.12 }}>{x}</div>)}</div></>, share: { eyebrow: 'My sound', period: label, items: genres.map((x) => ({ name: x })), theme: 0 } });
  return s;
}

export function Wrapped() {
  const H = useHistory();
  const years = yearsInData();
  const [year, setYear] = useState<number>(years[0] || 0);
  const open = (p: Period) => { const d = wrappedData(p); if (!d) { toast('No listening in that period'); return; } useApp.getState().openStory({ slides: wrappedSlides(d) }); };
  const playLive = async (r: string) => {
    try {
      const [ta, tt] = await Promise.all([Spotify.top('artists', r, 20), Spotify.top('tracks', r, 20)]);
      if (!ta.length) { toast('Spotify has no top artists for that range yet'); return; }
      ta.forEach(seedArtist);
      useApp.getState().openStory({ slides: liveSlides(LIVE_RANGES.find((x) => x[0] === r)![1], ta, tt.map(liveTrack)) });
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const months = H.loaded && year ? Array.from({ length: 12 }, (_, m) => m).filter((m) => { const p: Period = { kind: 'month', y: year, m }; return periodHasData(p) && aggregate(...periodRange(p)).plays > 0; }) : [];
  return (
    <>
      <div className="page-head"><div><h1 className="large-title">Wrapped</h1><p className="page-sub">Your year, or any month, as a story. Tap a card to play it.</p></div></div>
      {H.loaded && <>
        <section className="section" style={{ marginTop: 0 }}><SectionHead title="Years" />
          <div className="grid-tiles" style={{ ['--tile' as string]: '190px' }}>{years.map((y, k) => { const agg = aggregate(...periodRange({ kind: 'year', y })); const top = topArtists(agg, 1, 'ms')[0]; return (
            <button key={y} className="year-card" style={{ background: storyBg(k) }} onClick={() => open({ kind: 'year', y })}><div className="yc-top">Wrapped</div><div><div className="yc-year">{y}</div><div className="yc-sub">{fmtN(agg.ms / 60000)} minutes{top && <><br />Top artist: {top.name}</>}</div></div></button>
          ); })}</div></section>
        <section className="section"><SectionHead title="Months" />
          <div className="toolbar"><Segmented options={years.map((y) => [String(y), String(y)] as [string, string])} value={String(year)} onChange={(v) => setYear(+v)} label="Year" /></div>
          <div className="btn-row">{months.length ? months.map((m) => <button key={m} className="btn glass" onClick={() => open({ kind: 'month', y: year, m })}><Icon name="wrapped" />{MONTHS_LONG[m]}</button>) : <p className="muted">No listening that year.</p>}</div></section>
      </>}
      {Spotify.connected && <section className="section" style={H.loaded ? undefined : { marginTop: 0 }}><SectionHead title={H.loaded ? 'Right now, from Spotify' : 'Your story right now'} />
        <div className="grid-tiles" style={{ ['--tile' as string]: '190px' }}>{LIVE_RANGES.map(([r, l], k) => <button key={r} className="year-card" style={{ background: storyBg(k + 3) }} onClick={() => playLive(r)}><div className="yc-top">Snapshot</div><div><div className="yc-year" style={{ fontSize: 30, lineHeight: 1.05 }}>{l}</div><div className="yc-sub">Top artists, songs and genres</div></div></button>)}</div></section>}
      {!H.loaded && <section className="section"><SectionHead title="Yearly and monthly Wrapped" /><NeedHistory what="Wrapped for any year or month" /></section>}
    </>
  );
}

export function Milestones() {
  const H = useHistory();
  const head = <div className="page-head"><div><h1 className="large-title">Milestones</h1><p className="page-sub">The moments that shaped your listening.</p></div></div>;
  if (!H.loaded) return <>{head}<NeedHistory what="your milestones" /></>;
  const ev = milestones(); const big = ev.filter((e) => e.big);
  const byYear = new Map<number, typeof ev>(); ev.forEach((e) => { const y = new Date(e.t * 1000).getFullYear(); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y)!.push(e); });
  return (
    <>
      {head}
      {!!big.length && <div className="promos" style={{ marginTop: 0 }}>{big.map((e, k) => <div key={e.title} className={`promo ${['wrapped', 'miles', 'disc'][k % 3]}`}><div className="p-eyebrow">{fmtDate(e.t)}</div><div><div className="p-title">{e.title}</div><div className="p-sub">{e.sub}</div></div></div>)}</div>}
      {[...byYear.entries()].map(([y, list]) => (
        <div key={y}><div className="tl-year">{y}</div>
          <List>{list.map((e, i) => (
            <div key={i} className="tl-item">
              <div className="tl-ic" style={{ background: e.color }}><Icon name={e.icon as IconName} /></div>
              <div style={{ minWidth: 0 }}><div className="tl-t">{e.artist ? <Link to={`/artist/${encodeURIComponent(e.artist)}`}>{e.title}</Link> : e.title}</div><div className="tl-s">{e.sub}</div></div>
              <div className="tl-d">{fmtDate(e.t)}<button className="icon-btn sm plain" aria-label="Share" onClick={() => useApp.getState().openShare({ eyebrow: 'Milestone', period: fmtDate(e.t), image: e.artist ? cachedImage('artist', e.artist) : '', round: true, title: e.title, line: e.sub, theme: hashStr(e.title) })}><Icon name="share" /></button></div>
            </div>
          ))}</List>
        </div>
      ))}
    </>
  );
}
