import React, { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { useApp } from '../../app/store';
import { getSyncConfig, setSyncConfig, syncNow, pendingChanges, syncConflicts, type SyncConfig } from '../../data/sync';

const toast = (m: string, k: 'info' | 'error' | 'success' = 'info') => useApp.getState().toast(m, k);

export function SyncPanel() {
  const [cfg, setCfg] = useState<SyncConfig | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { getSyncConfig().then(setCfg); pendingChanges().then(setPending); const on = () => setOnline(navigator.onLine); addEventListener('online', on); addEventListener('offline', on); return () => { removeEventListener('online', on); removeEventListener('offline', on); }; }, []);
  if (!cfg) return null;
  const save = async (c: SyncConfig) => { setCfg(c); await setSyncConfig(c); };
  return (
    <div>
      <div className="card small" style={{ marginBottom: 10 }}>
        ATLAS CAD works fully offline. Every change is queued locally (with a hybrid logical clock) and pushed when a server is reachable. Conflicts: newest write wins per record; the other version is kept for review. With a passphrase, payloads are end-to-end encrypted (AES-256-GCM) before leaving the device.
      </div>
      <div className="kv small" style={{ marginBottom: 10 }}>
        <div>Network</div><div>{online ? <span className="badge ok">online</span> : <span className="badge warn">offline</span>}</div>
        <div>Pending changes</div><div>{pending}</div>
        <div>Last sync</div><div>{cfg.lastPullAt ? new Date(cfg.lastPullAt).toLocaleString() : 'never'}</div>
      </div>
      <div className="field"><label>Server URL (e.g. https://sync.example.com — see server/README)</label><input value={cfg.url} onChange={(e) => save({ ...cfg, url: e.target.value })} placeholder="https://…" /></div>
      <div className="field"><label>Access token</label><input type="password" value={cfg.token ?? ''} onChange={(e) => save({ ...cfg, token: e.target.value })} /></div>
      <div className="field"><label>End-to-end passphrase (optional, same on all devices)</label><input type="password" value={cfg.passphrase ?? ''} onChange={(e) => save({ ...cfg, passphrase: e.target.value })} /></div>
      <label className="row"><input type="checkbox" checked={cfg.enabled} onChange={(e) => save({ ...cfg, enabled: e.target.checked })} /> Auto-sync when online</label>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={busy || !cfg.url} onClick={async () => {
          setBusy(true);
          try { const r = await syncNow(); toast(`Sync: pushed ${r.pushed}, pulled ${r.pulled}${r.conflicts ? `, ${r.conflicts} conflicts` : ''}`, 'success'); }
          catch (e) { toast((e as Error).message, 'error'); }
          setBusy(false); setPending(await pendingChanges());
        }}><Icon name="sync" />{busy ? 'Syncing…' : 'Sync now'}</button>
      </div>
      {syncConflicts().length > 0 && <><div className="section">Conflicts ({syncConflicts().length})</div>{syncConflicts().slice(-20).map((c, i) => <div key={i} className="small">{c.table} {c.rowId} · {new Date(c.at).toLocaleString()} (local kept)</div>)}</>}
    </div>
  );
}
