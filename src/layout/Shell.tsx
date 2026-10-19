import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, type IconName } from '@/components/Icon';
import { useApp, usePrefs } from '@/store/app';
import { useSpotify } from '@/hooks/data';
import { Spotify, pickImg } from '@/lib/spotify';
import { initials } from '@/lib/format';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/charts', label: 'Charts', icon: 'charts' },
  { to: '/artists', label: 'Artists', icon: 'artists' },
  { to: '/playlists', label: 'Playlists', icon: 'playlists' },
  { to: '/discover', label: 'Discover', icon: 'discover' },
];
const NAV2: { to: string; label: string; icon: IconName }[] = [
  { to: '/wrapped', label: 'Wrapped', icon: 'wrapped' },
  { to: '/milestones', label: 'Milestones', icon: 'flag' },
];
const TITLES: Record<string, string> = { '': 'Home', charts: 'Charts', artists: 'Artists', playlists: 'Playlists', discover: 'Discover', wrapped: 'Wrapped', milestones: 'Milestones', settings: 'Settings', playlist: 'Playlist' };
const TOP = new Set(['', 'charts', 'artists', 'playlists', 'discover', 'wrapped', 'milestones', 'settings']);

export function BrandMark() { return <span className="brand-mark"><Icon name="note" /></span>; }

/** Ambient wallpaper: drifting color fields plus the current page's artwork, blurred. */
function Ambient() {
  const url = useApp((s) => s.ambient);
  const [shown, setShown] = useState(url);
  useEffect(() => { if (!url) return; const im = new Image(); im.onload = () => setShown(url); im.src = url; }, [url]);
  return (
    <div className="ambient" aria-hidden>
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <div className={`art ${shown ? 'on' : ''}`} style={shown ? { backgroundImage: `url("${shown}")` } : undefined} />
      <div className="grain" />
    </div>
  );
}

function useActive(to: string) {
  const { pathname } = useLocation();
  const seg = pathname.split('/')[1] || '';
  const t = to.split('/')[1] || '';
  if (t === seg) return true;
  return (t === 'artists' && seg === 'artist') || (t === 'playlists' && seg === 'playlist');
}
function SideItem({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  const active = useActive(to);
  return (
    <NavLink to={to} className="nav-item" aria-current={active ? 'page' : undefined}>
      {active && <motion.i layoutId="side-lens" className="nav-lens" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
      <Icon name={icon} /><span>{label}</span>
    </NavLink>
  );
}
function Account() {
  const me = useSpotify(['me'], () => Spotify.me());
  const img = pickImg(me.data?.images, 64);
  return (
    <Link className="acct" to="/settings">
      {me.data ? (img ? <img className="avatar" src={img} alt="" /> : <span className="avatar">{initials(me.data.display_name || '')}</span>) : <span className="avatar"><Icon name="spotify" /></span>}
      <div style={{ minWidth: 0 }}>
        <div className="ellipsis" style={{ fontSize: 13.5, fontWeight: 650 }}>{me.data?.display_name || (Spotify.connected ? 'Spotify' : 'Not connected')}</div>
        <small>{Spotify.connected ? 'Spotify connected' : 'Connect Spotify'}</small>
      </div>
    </Link>
  );
}
function Sidebar() {
  return (
    <aside className="sidebar glass" aria-label="Main navigation">
      <Link to="/" className="brand"><BrandMark /><span className="brand-name">Encore</span></Link>
      {NAV.map((n) => <SideItem key={n.to} {...n} />)}
      <div className="nav-label">Your story</div>
      {NAV2.map((n) => <SideItem key={n.to} {...n} />)}
      <div className="sidebar-foot"><SideItem to="/settings" label="Settings" icon="gear" /><Account /></div>
    </aside>
  );
}
function Tab({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  const active = useActive(to);
  return (
    <NavLink to={to} className={`tab ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
      {active && <motion.i layoutId="tab-lens" className="tab-lens" transition={{ type: 'spring', stiffness: 450, damping: 34 }} />}
      <Icon name={icon} /><span>{label}</span>
    </NavLink>
  );
}
function TabBar() {
  const active = useActive('/wrapped');
  return (
    <nav className="tabbar-wrap" aria-label="Tabs">
      <div className="tabbar glass">{NAV.map((n) => <Tab key={n.to} {...n} />)}</div>
      <Link to="/wrapped" className={`tab-orb glass ${active ? 'active' : ''}`} aria-label="Wrapped"><Icon name="wrapped" /></Link>
    </nav>
  );
}
function TopBar() {
  const { pathname } = useLocation(); const nav = useNavigate();
  const seg = pathname.split('/')[1] || '';
  const title = seg === 'artist' ? decodeURIComponent(pathname.split('/')[2] || '') : TITLES[seg] || '';
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 60); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  const detail = !TOP.has(seg);
  return (
    <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
      {detail && <button className="icon-btn glass" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"><Icon name="chevL" /></button>}
      <div className="title-pill glass ellipsis">{title}</div>
      <span className="spacer" />
      {seg !== 'settings' && <Link to="/settings" className="icon-btn glass mobile-only" aria-label="Settings"><Icon name="gear" /></Link>}
    </header>
  );
}

/** Applies appearance + Liquid Glass translucency to the document. */
function useAppearance() {
  const { appearance, glass } = usePrefs();
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = appearance === 'system' ? (mq.matches ? 'dark' : 'light') : appearance;
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#08080b' : '#eef0f6');
    };
    apply(); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [appearance]);
  useEffect(() => { document.documentElement.style.setProperty('--glass-t', String(glass / 100)); }, [glass]);
}

export function Shell({ children }: { children: ReactNode }) {
  useAppearance();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="shell">
      <Ambient />
      <Sidebar />
      <div className="main">
        <TopBar />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={pathname} className="page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
      <TabBar />
    </div>
  );
}
