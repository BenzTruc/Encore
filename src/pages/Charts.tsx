import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { Segmented, Stat, List, TrackRow, ArtistRow, Art, Empty, NeedHistory, Loading, SectionHead, Note } from '@/components/ui';
import { BarChart, ClockChart, DowHourHeat, CalendarHeat, StackedArea, HBars, SERIES } from '@/charts/Charts';
import { useApp } from '@/store/app';
import { useHistory, useSpotify } from '@/hooks/data';
import { Spotify, liveTrack, pickImg } from '@/lib/spotify';
import { cachedImage, seedArtist } from '@/lib/images';
import { LIVE_RANGES } from '@/lib/constants';
import {
  PLATFORMS, aggregate, comparablePrev, dayToSec, evolution, habits, latestPeriod, loyalty, newArtistsByYear, periodHasData, periodLabel, periodRange,
  personaFromHours, replayStats, seriesByBucket, shiftPeriod, skipStats, streaks, topAlbums, topArtists, topTracks, trackKey, yearlyTop,
  type Bucket, type BucketVal, type Period, type PeriodKind,
} from '@/lib/history';
import { MONTHS, WEEKDAYS, fmtCompact, fmtDate, fmtDur, fmtHour, fmtHours, fmtN, pct, plural } from '@/lib/format';

const share = (s: Parameters<ReturnType<typeof useApp.getState>['openShare']>[0]) => useApp.getState().openShare(s);
const ShareBtn = ({ onClick }: { onClick: () => void }) => <button className="btn sm glass" onClick={onClick}><Icon name="share" />Share</button>;

function usePeriod(): [Period, (p: Period) => void] {
  const p = useApp((s) => s.period); const set = useApp((s) => s.setPeriod);
  return [p || latestPeriod('year'), set];
}
function PeriodBar({ kinds = ['week', 'month', 'year'] as PeriodKind[], all = true, right }: { kinds?: PeriodKind[]; all?: boolean; right?: React.ReactNode }) {
  const [p, set] = usePeriod();
  const opts: [string, string][] = kinds.map((k) => [k, k[0].toUpperCase() + k.slice(1)]); if (all) opts.push(['all', 'All time']);
  const canPrev = p.kind !== 'all' && periodHasData(shiftPeriod(p, -1));
  const canNext = p.kind !== 'all' && periodHasData(shiftPeriod(p, 1));
  return (
    <div className="toolbar">
      <Segmented options={opts} value={p.kind} onChange={(k) => set(latestPeriod(k as PeriodKind))} label="Period" />
      {p.kind !== 'all' && (
        <div className="stepper glass flat">
          <button className="icon-btn" disabled={!canPrev} onClick={() => set(shiftPeriod(p, -1))} aria-label="Previous"><Icon name="chevL" /></button>
          <span className="lbl">{periodLabel(p)}</span>
          <button className="icon-btn" disabled={!canNext} onClick={() => set(shiftPeriod(p, 1))} aria-label="Next"><Icon name="chevR" /></button>
        </div>
      )}
      <span className="grow" />{right}
    </div>
  );
}
const Delta = ({ cur, prev }: { cur: number; prev?: number }) => {
  if (!prev) return null; const d = (cur - prev) / prev;
  return <span className={d >= 0 ? 'delta-up' : 'delta-down'}>{d >= 0 ? '▲' : '▼'} {pct(Math.abs(d))} vs previous</span>;
};
function bucketFor(p: Period, span: number): Bucket { return p.kind === 'week' || p.kind === 'month' ? 'day' : p.kind === 'year' ? 'month' : span > 86400 * 365 * 3 ? 'year' : 'month'; }
function bucketLabel(b: BucketVal, bucket: Bucket) {
  if (bucket === 'day') return { label: b.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), short: String(b.date.getDate()) };
  if (bucket === 'month') return { label: b.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), short: MONTHS[b.date.getMonth()] };
  return { label: String(b.date.getFullYear()), short: String(b.date.getFullYear()) };
}
const NoData = () => <Empty icon="calendar" title="No listening in this period">Pick another period with the arrows above.</Empty>;

function TopHistory() {
  const H = useHistory();
  const [p] = usePeriod(); const by = useApp((s) => s.metric); const setBy = useApp((s) => s.setMetric);
  const [showAll, setShowAll] = useState(false);
  const [a, b] = periodRange(p); const agg = aggregate(a, b); const prev = comparablePrev(p);
  const right = <Segmented options={[['plays', 'Plays'], ['ms', 'Minutes']]} value={by} onChange={(v) => setBy(v as 'plays' | 'ms')} label="Measure" />;
  if (!agg.events) return <><PeriodBar right={right} /><NoData /></>;
  const n = showAll ? 50 : 10, label = periodLabel(p);
  const spanDays = Math.max(1, Math.round((Math.min(b, H.last + 1) - Math.max(a, H.first)) / 86400));
  const bucket = bucketFor(p, H.last - H.first);
  const items = seriesByBucket(a, b, bucket).map((s) => { const l = bucketLabel(s, bucket); return { ...l, value: s.ms / 60000, tip: `${l.label}\n${fmtN(s.ms / 60000)} min · ${fmtN(s.plays)} plays` }; });
  const tA = topArtists(agg, n, by), tT = topTracks(agg, n, by), tAl = topAlbums(agg, n, by);
  const val = (x: { plays?: number; ms?: number }) => (by === 'ms' ? <><b>{fmtN(x.ms! / 60000)}</b> min</> : <b>{fmtN(x.plays!)}</b>);
  const maxA = tA[0] ? (by === 'ms' ? tA[0].ms : tA[0].plays) : 1;
  return (
    <>
      <PeriodBar right={right} />
      <div className="stats">
        <Stat k="Minutes" v={fmtN(agg.ms / 60000)} d={<Delta cur={agg.ms} prev={prev?.ms} />} />
        <Stat k="Streams" v={fmtN(agg.plays)} d={<Delta cur={agg.plays} prev={prev?.plays} />} />
        <Stat k="Artists" v={fmtN(agg.uniqArtists)} d={<Delta cur={agg.uniqArtists} prev={prev?.uniqArtists} />} />
        <Stat k="Songs" v={fmtN(agg.uniqTracks)} d={<Delta cur={agg.uniqTracks} prev={prev?.uniqTracks} />} />
        <Stat k="Per day" v={<>{fmtN(agg.ms / 60000 / spanDays)}<small>min</small></>} d={`across ${plural(spanDays, 'day')}`} />
      </div>
      <section className="section">
        <SectionHead title="Listening over time" note={`Minutes per ${bucket}`} right={<ShareBtn onClick={() => share({ eyebrow: 'Minutes listened', period: label, big: fmtN(agg.ms / 60000), unit: 'minutes', line: `${fmtN(agg.plays)} streams · ${plural(agg.uniqArtists, 'artist')} · ${plural(agg.uniqTracks, 'song')}`, theme: 2 })} />} />
        <div className="card glass"><BarChart items={items} height={220} fmt={fmtCompact} /></div>
      </section>
      <section className="section">
        <div className="cols c3">
          <div>
            <div className="col-title">Artists<ShareBtn onClick={() => share({ eyebrow: 'My top artists', period: label, items: tA.slice(0, 5).map((x) => ({ name: x.name, sub: `${fmtN(x.plays)} plays · ${fmtHours(x.ms)} h`, image: cachedImage('artist', x.name) })), roundItems: true, theme: 0 })} /></div>
            <List>{tA.map((x, i) => <ArtistRow key={x.name} name={x.name} rank={i + 1} value={val(x)} bar={(by === 'ms' ? x.ms : x.plays) / maxA} />)}</List>
          </div>
          <div>
            <div className="col-title">Songs<ShareBtn onClick={() => share({ eyebrow: 'My top songs', period: label, items: tT.slice(0, 5).map((x) => ({ name: x.name, sub: `${x.artist} · ${fmtN(x.plays!)} plays`, image: cachedImage('track', trackKey(x)) })), theme: 1 })} /></div>
            <List>{tT.map((x, i) => <TrackRow key={x.i} t={x} rank={i + 1} value={val(x)} to={`/artist/${encodeURIComponent(x.artist)}`} />)}</List>
          </div>
          <div>
            <div className="col-title">Albums</div>
            <List>{tAl.map((x, i) => (
              <Link key={x.i} className="row" to={`/artist/${encodeURIComponent(x.artist)}`}><span className="rank">{i + 1}</span><Art name={x.name} kind="track" k={x.key} size="sm" /><div style={{ minWidth: 0 }}><div className="t">{x.name}</div><div className="s">{x.artist}</div></div><div className="v">{val(x)}</div></Link>
            ))}</List>
          </div>
        </div>
        <div style={{ marginTop: 14 }}><button className="btn sm glass" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 10' : 'Show top 50'}</button></div>
      </section>
    </>
  );
}

function TopLive() {
  const r = useApp((s) => s.liveRange); const setR = useApp((s) => s.setLiveRange);
  const [showAll, setShowAll] = useState(false);
  const ta = useSpotify(['top', 'artists', r], () => Spotify.top('artists', r, 50));
  const tt = useSpotify(['top', 'tracks', r], () => Spotify.top('tracks', r, 50));
  ta.data?.forEach(seedArtist);
  const label = LIVE_RANGES.find((x) => x[0] === r)![1]; const n = showAll ? 50 : 20;
  const tracks = (tt.data || []).map(liveTrack);
  const g = new Map<string, number>(); (ta.data || []).forEach((a, i) => (a.genres || []).forEach((x) => g.set(x, (g.get(x) || 0) + (50 - i))));
  const genres = [...g.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  return (
    <>
      <div className="toolbar"><Segmented options={LIVE_RANGES} value={r} onChange={setR} label="Range" /><span className="muted small">Straight from Spotify</span></div>
      {(ta.isLoading || tt.isLoading) && <Loading />}
      {ta.error && <Note>{(ta.error as Error).message}</Note>}
      {!!genres.length && <section className="section" style={{ marginTop: 0 }}><SectionHead title="Your genres" /><div className="chips">{genres.map(([x], i) => <span key={x} className={`chip ${i < 3 ? 'accent' : ''}`}>{x}</span>)}</div></section>}
      {ta.data && tt.data && (
        <section className="section">
          <div className="cols">
            <div><div className="col-title">Artists<ShareBtn onClick={() => share({ eyebrow: 'My top artists', period: label, items: ta.data!.slice(0, 5).map((a) => ({ name: a.name, sub: a.genres?.slice(0, 2).join(', '), image: pickImg(a.images, 300) })), roundItems: true, theme: 0 })} /></div>
              <List>{ta.data.slice(0, n).map((a, i) => <ArtistRow key={a.id} name={a.name} sub={a.genres?.slice(0, 2).join(', ')} rank={i + 1} img={pickImg(a.images, 64)} />)}</List></div>
            <div><div className="col-title">Songs<ShareBtn onClick={() => share({ eyebrow: 'My top songs', period: label, items: tracks.slice(0, 5).map((t) => ({ name: t.name, sub: t.artist, image: t.img })), theme: 1 })} /></div>
              <List>{tracks.slice(0, n).map((t, i) => <TrackRow key={t.uri} t={t} rank={i + 1} value={fmtDur(t.duration)} to={`/artist/${encodeURIComponent(t.mainArtist)}`} />)}</List></div>
          </div>
          <div style={{ marginTop: 14 }}><button className="btn sm glass" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 20' : 'Show top 50'}</button></div>
        </section>
      )}
    </>
  );
}

function Habits() {
  const H = useHistory(); const [p] = usePeriod();
  const [a, b] = periodRange(p); const agg = aggregate(a, b);
  if (!agg.events) return <><PeriodBar /><NoData /></>;
  const hb = habits(a, b); const st = streaks(a, b); const per = personaFromHours(hb.hours);
  const favDow = hb.dow.indexOf(Math.max(...hb.dow));
  const spanDays = Math.max(1, Math.round((Math.min(b, H.last + 1) - Math.max(a, H.first)) / 86400));
  const calA = p.kind === 'all' ? H.last - 364 * 86400 : p.kind === 'year' ? a : Math.max(a, H.first), calB = p.kind === 'all' ? H.last + 1 : b;
  const calDaily = p.kind === 'all' ? habits(calA, calB).daily : hb.daily;
  const devices = Array.from(agg.pfMs).map((v, i) => ({ label: PLATFORMS[i], value: v })).filter((d) => d.value > 0).sort((x, y) => y.value - x.value);
  return (
    <>
      <PeriodBar />
      <div className="stats">
        <Stat k="Peak hour" v={fmtHour(per.peak)} d={per.title} />
        <Stat k="Favorite day" v={WEEKDAYS[favDow]} d={`${pct(hb.dow[favDow] / (agg.ms || 1))} of your listening`} />
        <Stat k="Longest streak" v={<>{fmtN(st.best.len)}<small>days</small></>} d={st.best.len ? `${fmtDate(dayToSec(st.best.s), { day: 'numeric', month: 'short' })} – ${fmtDate(dayToSec(st.best.e))}` : ''} />
        <Stat k="Days listening" v={fmtN(st.activeDays)} d={`${pct(Math.min(1, st.activeDays / spanDays))} of days`} />
        {!H.meta?.basicOnly && <Stat k="On shuffle" v={pct(agg.shuf / (agg.events || 1))} d={`${pct(agg.off / (agg.events || 1))} offline`} />}
      </div>
      <section className="section">
        <div className="cards">
          <div className="card glass"><h3>Listening clock</h3><p className="card-sub">{per.text} You listen most around {fmtHour(per.peak)}.</p><ClockChart hours={hb.hours} /></div>
          <div className="card glass"><h3>Your week</h3><p className="card-sub">Hours by weekday and time of day</p><DowHourHeat m={hb.dowHour} />
            <div style={{ marginTop: 20 }}><HBars rows={WEEKDAYS.map((d, i) => ({ label: d, value: hb.dow[i] }))} fmt={(v) => fmtHours(v) + ' h'} /></div></div>
        </div>
      </section>
      <section className="section"><SectionHead title={p.kind === 'all' ? 'Your last 12 months, day by day' : 'Day by day'} /><div className="card glass"><CalendarHeat daily={calDaily} a={calA} b={calB} /></div></section>
      {devices.length > 0 && !H.meta?.basicOnly && <section className="section"><SectionHead title="Where you listen" /><div className="card glass" style={{ maxWidth: 680 }}><HBars rows={devices} fmt={(v) => `${fmtHours(v)} h · ${pct(v / (agg.ms || 1))}`} /></div></section>}
    </>
  );
}

function Evolution() {
  const H = useHistory(); const [p] = usePeriod(); const [mode, setMode] = useState<'hours' | 'share'>('hours');
  const [a, b] = periodRange(p);
  const bucket: Bucket = p.kind === 'all' ? (H.last - H.first > 86400 * 365 * 8 ? 'year' : 'month') : p.kind === 'year' ? 'month' : 'day';
  const ev = evolution(a, b, 8, bucket); const yt = yearlyTop(5); const na = newArtistsByYear();
  const color = new Map((ev?.series || []).map((s, i) => [s.name, SERIES[i]]));
  return (
    <>
      <PeriodBar kinds={['month', 'year']} right={<Segmented options={[['hours', 'Hours'], ['share', 'Share']]} value={mode} onChange={(v) => setMode(v as 'hours' | 'share')} label="Scale" />} />
      <section className="section" style={{ marginTop: 0 }}><SectionHead title="Your top artists over time" note={periodLabel(p)} /><div className="card glass"><StackedArea ev={ev} share={mode === 'share'} height={300} /></div></section>
      {yt.length > 1 && (
        <section className="section"><SectionHead title="Top five, year by year" />
          <div className="scroll-x" style={{ paddingBottom: 8 }}><div style={{ display: 'grid', gridTemplateColumns: `repeat(${yt.length}, minmax(176px, 1fr))`, gap: 12, minWidth: Math.min(yt.length * 188, 1200) }}>
            {yt.map((y) => (
              <div key={y.y} className="card glass" style={{ padding: 16 }}>
                <div style={{ fontFamily: 'var(--font-round)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>{y.y}</div>
                <div className="muted small" style={{ marginBottom: 8 }}>{fmtHours(y.ms)} hours</div>
                {y.artists.map((x, i) => <Link key={x.name} to={`/artist/${encodeURIComponent(x.name)}`} style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'inherit', padding: '5px 0', fontSize: 13.5 }}><span className="muted tnum" style={{ width: 14 }}>{i + 1}</span><i style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: color.get(x.name) || 'var(--fill-3)' }} /><span className="ellipsis">{x.name}</span></Link>)}
              </div>
            ))}
          </div></div>
          <p className="muted small">Colored dots mark artists in the chart above.</p>
        </section>
      )}
      {na.length > 1 && <section className="section"><SectionHead title="New artists you discovered each year" /><div className="card glass"><BarChart items={na.map((x) => ({ label: String(x.y), value: x.n, tip: `${x.y}\n${fmtN(x.n)} new artists` }))} height={200} fmt={fmtN} /></div></section>}
    </>
  );
}

function Skips() {
  const H = useHistory(); const [p] = usePeriod();
  const [a, b] = periodRange(p); const agg = aggregate(a, b);
  if (!agg.events) return <><PeriodBar /><NoData /></>;
  const sk = skipStats(agg); const rep = replayStats(a, b, 10); const loy = loyalty(12);
  return (
    <>
      <PeriodBar />
      {H.meta?.basicOnly && <div style={{ marginBottom: 14 }}><Note>Your basic history has no skip button data, so a skip here means a play shorter than 30 seconds.</Note></div>}
      <div className="stats">
        <Stat k="Skip rate" v={pct(sk.rate)} d="of everything you started" />
        <Stat k="Skips" v={fmtN(agg.skips)} />
        <Stat k="Never skipped" v={`${fmtN(sk.alwaysFinish.length)}${sk.alwaysFinish.length >= 25 ? '+' : ''}`} d="songs played 6+ times" />
        <Stat k="Most in one day" v={rep[0] ? <>{rep[0].count}<small>plays</small></> : '–'} d={rep[0]?.name} />
      </div>
      <section className="section"><div className="cols">
        <div><div className="col-title">Skipped the most</div>{sk.mostSkipped.length ? <List>{sk.mostSkipped.slice(0, 12).map((t, i) => <TrackRow key={t.i} t={t} rank={i + 1} value={<><b>{pct(t.rate!)}</b> of {fmtN(t.events!)}</>} />)}</List> : <p className="muted">Nothing skipped often enough to rank.</p>}</div>
        <div><div className="col-title">Never skipped</div>{sk.alwaysFinish.length ? <List>{sk.alwaysFinish.slice(0, 12).map((t, i) => <TrackRow key={t.i} t={t} rank={i + 1} value={<><b>{fmtN(t.plays!)}</b> plays</>} />)}</List> : <p className="muted">No songs played 6+ times without a skip.</p>}</div>
      </div></section>
      <section className="section"><div className="cols">
        <div className="card glass"><h3>Artists you skip</h3><p className="card-sub">Share of their songs you skip (25+ starts)</p>{sk.artistSkip.length ? <HBars rows={sk.artistSkip.map((x) => ({ label: <Link to={`/artist/${encodeURIComponent(x.name)}`} style={{ color: 'inherit' }}>{x.name}</Link>, value: x.rate }))} fmt={(v) => pct(v)} color="var(--s2)" /> : <p className="muted">Not enough plays yet.</p>}</div>
        <div className="card glass"><h3>Artists you never leave</h3><p className="card-sub">Lowest skip rates (25+ starts)</p>{sk.artistLoyal.length ? <HBars rows={sk.artistLoyal.map((x) => ({ label: <Link to={`/artist/${encodeURIComponent(x.name)}`} style={{ color: 'inherit' }}>{x.name}</Link>, value: 1 - x.rate }))} fmt={(v) => pct(v) + ' finished'} color="var(--s3)" /> : <p className="muted">Not enough plays yet.</p>}</div>
      </div></section>
      {!!rep.length && <section className="section"><SectionHead title="On repeat: most plays in a single day" /><List>{rep.map((t, i) => <TrackRow key={t.i} t={t} rank={i + 1} value={<><b>{t.count}×</b> · {fmtDate(dayToSec(t.day!))}</>} />)}</List></section>}
      {!!loy.length && <section className="section"><SectionHead title="Longest relationships" note="All time · months with at least one play" /><List>{loy.map((x, i) => <ArtistRow key={x.name} name={x.name} rank={i + 1} sub={`Since ${fmtDate(x.first, { month: 'short', year: 'numeric' })} · last played ${fmtDate(x.last, { month: 'short', year: 'numeric' })}`} value={<><b>{fmtN(x.activeMonths)}</b> months</>} />)}</List></section>}
    </>
  );
}

export default function Charts() {
  const H = useHistory(); const live = Spotify.connected;
  const tab = useApp((s) => s.chartsTab), setTab = useApp((s) => s.setChartsTab);
  const src = useApp((s) => s.topSource), setSrc = useApp((s) => s.setTopSource);
  let body: React.ReactNode;
  if (!H.loaded && !live) body = <NeedHistory what="your charts" />;
  else if (tab === 'top') body = H.loaded && (src === 'history' || !live) ? <TopHistory /> : <TopLive />;
  else if (!H.loaded) body = <NeedHistory what={tab === 'habits' ? 'when and how you listen' : tab === 'evolution' ? 'how your taste changed' : 'what you skip and stay loyal to'} />;
  else body = tab === 'habits' ? <Habits /> : tab === 'evolution' ? <Evolution /> : <Skips />;
  return (
    <>
      <div className="page-head">
        <div><h1 className="large-title">Charts</h1></div>
        {tab === 'top' && H.loaded && live && <Segmented options={[['history', 'My history'], ['live', 'Spotify now']]} value={src} onChange={(v) => setSrc(v as 'history' | 'live')} label="Source" />}
      </div>
      <div className="toolbar"><Segmented size="lg" options={[['top', 'Top'], ['habits', 'Habits'], ['evolution', 'Evolution'], ['skips', 'Skips & loyalty']]} value={tab} onChange={(v) => setTab(v as typeof tab)} label="Charts" /></div>
      {body}
    </>
  );
}
