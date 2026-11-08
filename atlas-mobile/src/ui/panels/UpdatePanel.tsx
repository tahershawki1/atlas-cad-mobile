import React, { useState } from 'react';
import { Icon } from '../icons';
import { APP_VERSION, GITHUB_OWNER, GITHUB_REPO } from '../../platform/updater';
import { checkForUpdate, downloadAndInstall, type ReleaseInfo } from '../../platform/updater';
import { useApp } from '../../app/store';
import { isNative } from '../../platform/native';

export function UpdatePanel() {
  const toast = useApp((s) => s.toast);
  const [rel, setRel] = useState<ReleaseInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const hasUpdate = rel?.version ? (rel.version !== APP_VERSION) : false;

  const onCheck = async () => {
    setBusy(true);
    try {
      const r = await checkForUpdate(true);
      setRel(r);
    } finally {
      setBusy(false);
    }
  };

  const onInstall = async () => {
    if (!rel) return;
    setDownloading(true);
    setProgress(null);
    try {
      await downloadAndInstall(rel, (received, total) => setProgress({ received, total }));
      toast('Installer opened — confirm to update.', 'success');
    } catch (e) {
      toast(`Download/install failed: ${(e as Error).message}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : null;

  return (
    <div>
      <div className="card">
        <div className="row"><Icon name="sync" /><b className="grow">Software version</b><span className="badge info">{APP_VERSION}</span></div>
        <div className="kv small" style={{ marginTop: 6 }}>
          <div>Channel</div><div>GitHub Releases</div>
          <div>Repository</div><div className="mono" style={{ fontSize: 11 }}>{GITHUB_OWNER}/{GITHUB_REPO}</div>
          <div>Platform</div><div>{isNative() ? 'Android (APK — install is confirmed by the system)' : 'Web (download opens in browser)'}</div>
        </div>
      </div>

      <div className="section">Check</div>
      <div className="row wrap">
        <button className="btn primary" disabled={busy} onClick={onCheck}><Icon name="sync" />{busy ? 'Checking…' : 'Check for updates'}</button>
      </div>
      {rel && (
        <div className="card small" style={{ marginTop: 8 }}>
          <div className="kv">
            <div>Latest</div><div><b>{rel.version}</b> ({rel.publishedAt ? new Date(rel.publishedAt).toLocaleDateString() : '—'})</div>
            {rel.apk && <><div>APK</div><div className="mono" style={{ fontSize: 10 }}>{rel.apk.name} · {(rel.apk.size / 1048576).toFixed(1)} MB</div></>}
          </div>
          {hasUpdate ? (
            <>
              <div className="badge warn" style={{ marginTop: 6 }}>Update available</div>
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={downloading} onClick={onInstall}>{downloading ? 'Downloading…' : 'Download & install'}</button>
              </div>
              {downloading && progress && <div className="small muted" style={{ marginTop: 6 }}>{(progress.received / 1048576).toFixed(1)} / {(progress.total / 1048576).toFixed(1)} MB{pct !== null ? ` · ${pct}%` : ''}</div>}
              <p className="small muted" style={{ marginTop: 6 }}>Android asks you to allow “Install unknown apps” for the browser/files app on first install, and you tap Install to confirm. ATLAS cannot install silently — that needs device-owner (MDM) privileges.</p>
            </>
          ) : (
            <div className="badge ok" style={{ marginTop: 6 }}>You are up to date</div>
          )}
          {rel.body && <div className="section" style={{ marginTop: 10 }}>Release notes</div>}
          {rel.body && <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{rel.body.slice(0, 4000)}</pre>}
        </div>
      )}
      {!rel && <p className="small muted" style={{ marginTop: 8 }}>Press “Check for updates” to compare this build ({APP_VERSION}) with the latest GitHub Release.</p>}
    </div>
  );
}
