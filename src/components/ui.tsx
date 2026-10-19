import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { initials, tileGrad } from '@/lib/format';
import { cachedImage, resolveImage, type ArtKind } from '@/lib/images';
import { Spotify } from '@/lib/spotify';
import { trackKey, type Track } from '@/lib/history';

/* ---------- Artwork: uses a known image, else looks one up when it scrolls into view ---------- */
export function Art({ name, img, kind, k, round, size = '', className = '' }: { name: string; img?: string; kind?: ArtKind; k?: string; round?: boolean; size?: '' | 'sm' | 'xs'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(img || (kind && k ? cachedImage(kind, k) : '') || '');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setUrl(img || (kind && k ? cachedImage(kind, k) : '') || ''); }, [img, kind, k]);
  useEffect(() => {
    if (url || !kind || !k || !Spotify.connected || !ref.current) return;
    let alive = true;
    const io = new IntersectionObserver((ents) => {
      if (!ents[0].isIntersecting) return;
      io.disconnect();
      resolveImage(kind, k).then((u) => { if (alive && u) setUrl(u); });
    }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => { alive = false; io.disconnect(); };
  }, [url, kind, k]);
  return (
    <div ref={ref} className={`art ${size} ${round ? 'round' : ''} ${className}`} style={{ background: tileGrad(name) }}>
      <span className="mono">{initials(name)}</span>
      {url && <img src={url} alt="" loading="lazy" className={loaded ? 'on' : ''} onLoad={() => setLoaded(true)} onError={() => setUrl('')} />}
    </div>
  );
}

/* ---------- Segmented control with gliding glass lens ---------- */
export function Segmented<T extends string>({ options, value, onChange, size, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; size?: 'lg'; label?: string }) {
  const id = useId();
  return (
    <div className={`seg glass flat ${size || ''}`} role="tablist" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {v === value && <motion.i layoutId={'lens' + id} className="lens" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span>{l}</span>
        </button>
      ))}
    </div>
  );
}

export function SectionHead({ title, to, note, right }: { title: string; to?: string; note?: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-head">
      {to ? <Link to={to} className="section-title">{title}<Icon name="chevR" className="chev" /></Link> : <h2 className="section-title">{title}</h2>}
      {(note || right) && <div className="btn-row" style={{ gap: 12 }}>{note && <span className="section-note">{note}</span>}{right}</div>}
    </div>
  );
}

export function Empty({ icon = 'history', title, children, actions }: { icon?: IconName; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty glass">
      <Icon name={icon} className="big" />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="btn-row" style={{ justifyContent: 'center' }}>{actions}</div>}
    </div>
  );
}
export const NeedHistory = ({ what = 'this' }: { what?: string }) => (
  <Empty icon="history" title="Waiting for your listening history" actions={<Link className="btn primary" to="/settings"><Icon name="upload" />Import history</Link>}>
    To see {what}, import the history file Spotify emails you. You can drop the .zip straight in.
  </Empty>
);
export const NeedSpotify = ({ what = 'This' }: { what?: string }) => (
  <Empty icon="spotify" title="Connect Spotify" actions={<Link className="btn primary" to="/settings">Connect Spotify</Link>}>{what} needs your Spotify account.</Empty>
);
export const Loading = ({ text = 'Loading…' }: { text?: string }) => <div className="loading"><div className="spinner" />{text}</div>;
export const Note = ({ icon = 'info', children }: { icon?: IconName; children: ReactNode }) => <div className="note glass flat"><Icon name={icon} /><span>{children}</span></div>;

/* ---------- Rows & tiles ---------- */
export function TrackRow({ t, rank, value, to, bar, check, onCheck, onClick, img }: { t: Track; rank?: number; value?: ReactNode; to?: string; bar?: number; check?: boolean; onCheck?: () => void; onClick?: () => void; img?: string }) {
  const inner = (
    <>
      {check !== undefined && <span className={`check-dot ${check ? 'on' : ''}`}><Icon name="check" /></span>}
      {rank !== undefined && <span className="rank">{rank}</span>}
      <Art name={t.album || t.name} img={img ?? t.img} kind="track" k={trackKey(t)} size="sm" />
      <div style={{ minWidth: 0 }}>
        <div className="t">{t.name}</div>
        <div className="s">{t.artist}{t.album ? ' · ' + t.album : ''}</div>
        {bar !== undefined && <div className="bar"><i style={{ width: `${(bar * 100).toFixed(1)}%` }} /></div>}
      </div>
      <div className="v">{value}</div>
    </>
  );
  const cls = `row ${rank === undefined && check === undefined ? 'no-rank' : ''} ${check !== undefined ? 'checkable' : ''}`;
  if (check !== undefined) return <button className={cls} onClick={onCheck} aria-pressed={check}>{inner}</button>;
  if (to) return <Link className={cls} to={to}>{inner}</Link>;
  if (onClick) return <button className={cls} onClick={onClick}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}
export function ArtistRow({ name, sub, rank, value, bar, img }: { name: string; sub?: string; rank?: number; value?: ReactNode; bar?: number; img?: string }) {
  return (
    <Link className={`row ${rank === undefined ? 'no-rank' : ''}`} to={`/artist/${encodeURIComponent(name)}`}>
      {rank !== undefined && <span className="rank">{rank}</span>}
      <Art name={name} img={img} kind="artist" k={name} round size="sm" />
      <div style={{ minWidth: 0 }}>
        <div className="t">{name}</div>
        {sub && <div className="s">{sub}</div>}
        {bar !== undefined && <div className="bar"><i style={{ width: `${(bar * 100).toFixed(1)}%` }} /></div>}
      </div>
      <div className="v">{value}</div>
    </Link>
  );
}
export function ArtistTile({ name, sub, img }: { name: string; sub?: string; img?: string }) {
  return (
    <Link className="tile round" to={`/artist/${encodeURIComponent(name)}`}>
      <Art name={name} img={img} kind="artist" k={name} round />
      <div className="tile-title">{name}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </Link>
  );
}
export function TrackTile({ t, sub, to }: { t: Track; sub?: string; to?: string }) {
  const body = <><Art name={t.album || t.name} img={t.img} kind="track" k={trackKey(t)} /><div className="tile-title">{t.name}</div><div className="tile-sub">{sub ?? t.artist}</div></>;
  return to ? <Link className="tile" to={to}>{body}</Link> : <div className="tile">{body}</div>;
}
export function List({ children }: { children: ReactNode }) { return <div className="group glass"><div className="list">{children}</div></div>; }
export function Stat({ k, v, d, sm, dClass }: { k: string; v: ReactNode; d?: ReactNode; sm?: boolean; dClass?: string }) {
  return <div className="stat glass"><div className="k">{k}</div><div className={`val ${sm ? 'sm' : ''}`}>{v}</div>{d && <div className={`d ${dClass || ''}`}>{d}</div>}</div>;
}
