import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { Note, SectionHead, Segmented, Stat } from '@/components/ui';
import { useApp, usePrefs, toast, type Appearance } from '@/store/app';
import { useHistory, useSpotify } from '@/hooks/data';
import { useConfirm } from '@/hooks/useConfirm';
import { Spotify, LastFm, pickImg, clearCache } from '@/lib/spotify';
import { clearHistory, importHistoryFiles, latestPeriod } from '@/lib/history';
import { fmtDate, fmtN, initials, tileGrad } from '@/lib/format';

function Copy({ text }: { text: string }) {
  return <div className="copyline"><span>{text}</span><button className="btn sm plain" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copied', 'ok'), () => toast('Select the text and copy it manually', 'err'))}>Copy</button></div>;
}

function Dropzone({ label }: { label: string }) {
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<{ msg: string; p: number } | null>(null);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const run = async (files: File[]) => {
    setErr(''); setStatus({ msg: 'Starting', p: 0.02 });
    try {
      const r = await importHistoryFiles(files, (msg, p) => setStatus({ msg, p }));
      useApp.getState().setPeriod(latestPeriod('year'));
      useApp.getState().bumpHistory();
      toast(`Imported ${fmtN(r.streams)} streams`, 'ok');
      if (r.skippedFiles.length) toast(`Skipped unreadable files: ${r.skippedFiles.join(', ')}`, 'err');
      nav('/');
    } catch (e) { setErr((e as Error).message); } finally { setStatus(null); }
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label className={`drop glass flat ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) run([...e.dataTransfer.files]); }}>
        <Icon name="upload" className="big" />
        <b>{label}</b>
        <span className="muted small">Drag the .zip or .json files here, or click to choose</span>
        <input ref={input} type="file" accept=".zip,.json,application/json,application/zip" multiple hidden onChange={(e) => e.target.files?.length && run([...e.target.files])} />
      </label>
      {status && <div className="card glass" style={{ display: 'grid', gap: 10 }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><div className="spinner" />{status.msg}</div><div className="progress"><i style={{ width: `${Math.round(status.p * 100)}%` }} /></div></div>}
      {err && <Note>{err}</Note>}
    </div>
  );
}

export default function Settings() {
  const H = useHistory();
  const qc = useQueryClient();
  const me = useSpotify(['me'], () => Spotify.me());
  const [clientId, setClientId] = useState(Spotify.clientId);
  const [lfm, setLfm] = useState(LastFm.key);
  const { appearance, glass, setAppearance, setGlass } = usePrefs();
  const [confirmNode, ask] = useConfirm();
  const redirect = Spotify.redirectUri();

  const connect = async () => {
    const id = clientId.trim();
    if (!/^[a-f0-9]{32}$/i.test(id)) { toast('That Client ID doesn’t look right. It’s 32 letters and numbers.', 'err'); return; }
    Spotify.clientId = id;
    try { await Spotify.login(); } catch (e) { toast((e as Error).message, 'err'); }
  };
  const disconnect = async () => {
    if (!(await ask({ title: 'Disconnect Spotify?', text: 'Encore forgets your Spotify login on this device. Your imported history stays.', ok: 'Disconnect', danger: true }))) return;
    Spotify.logout(); qc.clear(); useApp.getState().bumpSpotify();
  };
  const removeHistory = async () => {
    if (!(await ask({ title: 'Remove your history?', text: 'This deletes the imported listening history from this browser. You can import the files again any time.', ok: 'Remove', danger: true }))) return;
    await clearHistory(); useApp.getState().bumpHistory();
  };
  const img = pickImg(me.data?.images, 128);

  return (
    <>
      {confirmNode}
      <div className="page-head"><div><h1 className="large-title">Settings</h1><p className="page-sub">Connect your accounts and make Encore yours. Everything stays in this browser.</p></div></div>

      <section className="section">
        <SectionHead title="Appearance" />
        <div className="cards">
          <div className="card glass" style={{ display: 'grid', gap: 16 }}>
            <div className="field"><span className="label">Theme</span>
              <Segmented<Appearance> options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'Automatic']]} value={appearance} onChange={setAppearance} label="Theme" /></div>
            <div className="field">
              <label className="label" htmlFor="glassSlider">Liquid Glass</label>
              <input id="glassSlider" type="range" min={0} max={100} value={glass} onChange={(e) => setGlass(+e.target.value)} />
              <div className="muted small" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Clear</span><span>Tinted</span></div>
            </div>
          </div>
          <div className="card glass" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <h3>Preview</h3>
            <p className="muted small">Clear glass shows more of the colors behind it. Tinted glass is calmer and easier to read.</p>
            <div className="glass-demo">{['Songs', 'Artists', 'Albums'].map((x) => <div key={x} className="glass">{x}</div>)}</div>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead title="Spotify" />
        {Spotify.connected && me.data ? (
          <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {img ? <img src={img} alt="" style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover' }} /> : <div className="art round" style={{ width: 58, background: tileGrad(me.data.display_name || '') }}><span className="mono" style={{ fontSize: 20 }}>{initials(me.data.display_name || '')}</span></div>}
            <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontWeight: 700, fontSize: 17 }}>{me.data.display_name || me.data.id}</div><div className="muted small">Connected to Spotify</div></div>
            <div className="btn-row"><button className="btn plain" onClick={() => { clearCache(); qc.invalidateQueries(); useApp.getState().bumpSpotify(); toast('Refreshed'); }}><Icon name="refresh" />Refresh</button><button className="btn danger" onClick={disconnect}><Icon name="logout" />Disconnect</button></div>
          </div>
        ) : (
          <>
            {!Spotify.canConnect() && <div style={{ marginBottom: 14 }}><Note>You opened Encore from a file. Spotify only allows logins from a web address, so open your Encore link to connect.</Note></div>}
            <div className="cards">
              <div className="card glass">
                <h3>Create your Spotify developer app</h3>
                <p className="card-sub">A one-time, five-minute step. Spotify requires it for personal apps, and it needs a Premium account.</p>
                <ol className="steps">
                  <li><span>Open <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a> and log in with your Spotify account.</span></li>
                  <li><span>Click <b>Create app</b>. Name it <b>Encore</b> and give it any description.</span></li>
                  <li><span>Under <b>Redirect URIs</b>, paste this exact address and click <b>Add</b>:<Copy text={redirect} /></span></li>
                  <li><span>Tick <b>Web API</b>, accept the terms and click <b>Save</b>.</span></li>
                  <li><span>Copy the <b>Client ID</b> from your app's page and paste it here.</span></li>
                </ol>
              </div>
              <div className="card glass" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                <h3>Connect</h3>
                <div className="field"><label htmlFor="clientId">Client ID</label><input id="clientId" className="input" placeholder="32-character code from your Spotify app" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} /></div>
                <button className="btn primary" onClick={connect} disabled={!Spotify.canConnect()}><Icon name="spotify" />Connect Spotify</button>
                <p className="muted small">Spotify asks you to approve access to your top artists and songs, recently played songs, saved songs and playlists. Encore only changes playlists when you tell it to.</p>
                <p className="muted small">If Spotify says your account isn't allowed, open your app in the dashboard, go to <b>User Management</b> and add the email of your Spotify account.</p>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="section">
        <SectionHead title="Listening history" />
        {H.loaded ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="stats">
              <Stat k="Streams" v={fmtN(H.n)} /><Stat k="Songs" v={fmtN(H.tCount)} /><Stat k="Artists" v={fmtN(H.artists.length)} />
              <Stat k="From" v={fmtDate(H.first)} sm /><Stat k="To" v={fmtDate(H.last)} sm />
            </div>
            {H.meta?.basicOnly && <Note>This is Spotify's basic one-year history, without skip or device details. For your full lifetime history, request <b>Extended streaming history</b> and import it here.</Note>}
            <Dropzone label="Add more history files" />
            <div><button className="btn danger" onClick={removeHistory}><Icon name="trash" />Remove history from this device</button></div>
          </div>
        ) : (
          <div className="cards">
            <div className="card glass">
              <h3>Get your full history from Spotify</h3>
              <p className="card-sub">Spotify emails it to you as a .zip file. It usually takes a few days and at most 30.</p>
              <ol className="steps">
                <li><span>Open <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noopener">spotify.com/account/privacy</a>.</span></li>
                <li><span>Under <b>Download your data</b>, tick <b>Extended streaming history</b> and click <b>Request data</b>.</span></li>
                <li><span>Confirm the request in the email Spotify sends you.</span></li>
                <li><span>When the “your data is ready” email arrives, download the .zip and drop it here. No need to unzip it.</span></li>
              </ol>
            </div>
            <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
              <Dropzone label="Drop your Spotify data here" />
              <p className="muted small">Works with the full .zip, the <code>Streaming_History_Audio</code> files, or the basic <code>StreamingHistory_music</code> files.</p>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <SectionHead title="Last.fm" note="Optional · for similar artists" />
        <div className="card glass" style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
          <p className="muted">Encore uses Last.fm's similar-artist data to suggest new music. Create a free API account at <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">last.fm/api/account/create</a> (any app name works), then paste the <b>API key</b> here.</p>
          <div className="btn-row"><input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Last.fm API key" value={lfm} onChange={(e) => setLfm(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Last.fm API key" /><button className="btn plain" onClick={() => { LastFm.key = lfm.trim(); toast(lfm.trim() ? 'Last.fm key saved' : 'Last.fm key removed', 'ok'); }}>Save key</button></div>
        </div>
      </section>

      <section className="section">
        <SectionHead title="Privacy" />
        <Note icon="lock">Encore has no server. Your history is stored in this browser, your Spotify login stays here too, and requests go straight from your browser to Spotify and Last.fm. Clearing your browser data removes everything.</Note>
      </section>
    </>
  );
}
