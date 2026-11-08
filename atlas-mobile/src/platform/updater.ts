import { registerPlugin, type PluginListenerHandle, Capacitor } from '@capacitor/core';
import { isNative } from './native';
import { APP_VERSION } from './version';
import { useApp } from '../app/store';

/**
 * ATLAS CAD software update (GitHub Releases).
 *
 * Flow: push tag vX.Y.Z → GitHub Action builds atlas-cad-debug.apk → published as a
 * Release asset → app calls GET /repos/{OWNER}/{REPO}/releases/latest → compares
 * semver → downloads APK via UpdatePlugin (native) → opens system installer.
 * Android cannot silently install without device-owner privileges, so the user
 * confirms the install — this is the standard open-source Capacitor flow.
 *
 * Configure OWNER/REPO here (or leave OWNER empty to use the bundled default).
 */
export const GITHUB_OWNER = 'tahershawki1';
export const GITHUB_REPO = 'atlas-cad-mobile';
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export interface UpdatePlugin {
  getVersionCode(): Promise<{ versionName: string; versionCode: number }>;
  download(opts: { url: string; fileName: string }): Promise<{ filePath: string; uri: string; size: number }>;
  openInstaller(opts: { uri: string }): Promise<void>;
  addListener(event: 'downloadProgress', cb: (e: { received: number; total: number }) => void): Promise<PluginListenerHandle>;
}

export const UpdatePlugin = registerPlugin<UpdatePlugin>('UpdatePlugin');

export interface ReleaseAsset { name: string; browser_download_url: string; size: number }
export interface ReleaseInfo {
  tag: string;
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  apk?: ReleaseAsset;
  webAssets?: ReleaseAsset[];
}

const STRIP_V = (s: string) => s.replace(/^v/i, '');
export function compareSemver(a: string, b: string): number {
  const pa = STRIP_V(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = STRIP_V(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  // non-numeric suffix (e.g. 1.0.0-beta): prefer the plain release
  if (STRIP_V(a) === STRIP_V(b)) return 0;
  return STRIP_V(a).length > STRIP_V(b).length ? -1 : 1;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const res = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ATLAS-CAD' },
  });
  if (!res.ok) throw new Error(`Cannot reach GitHub Releases (HTTP ${res.status}). Check connection and that a release exists.`);
  const j: any = await res.json();
  const assets: ReleaseAsset[] = (j.assets ?? []).map((a: any) => ({ name: a.name, browser_download_url: a.browser_download_url, size: a.size }));
  const apk = assets.find((a) => a.name.endsWith('.apk')) ?? assets.find((a) => a.name.endsWith('.aab'));
  const webAssets = assets.filter((a) => a.name.endsWith('.tgz') || a.name.endsWith('.zip'));
  return {
    tag: j.tag_name ?? '',
    version: STRIP_V(j.tag_name ?? ''),
    name: j.name ?? '',
    body: j.body ?? '',
    publishedAt: j.published_at ?? '',
    apk,
    webAssets,
  };
}

/** Check for an update. When notify=true, toast on success/failures. */
export async function checkForUpdate(notify = true): Promise<ReleaseInfo | null> {
  const toast = (m: string, k: 'info' | 'error' | 'success' = 'info') => useApp.getState().toast(m, k);
  try {
    const rel = await fetchLatestRelease();
    if (!rel.version) { if (notify) toast('No version in latest release', 'error'); return null; }
    const cmp = compareSemver(rel.version, APP_VERSION);
    if (cmp > 0) {
      if (notify) toast(`Update available: ${APP_VERSION} → ${rel.version}. Open Update to install.`, 'success');
    } else if (notify) {
      toast(`You are on the latest version (${APP_VERSION}).`, 'info');
    }
    return rel;
  } catch (e) {
    if (notify) toast(`Update check failed: ${(e as Error).message}`, 'error');
    return null;
  }
}

/** Download the release APK (native) or open the release page (web). */
export async function downloadAndInstall(rel: ReleaseInfo, onProgress?: (received: number, total: number) => void): Promise<void> {
  if (!rel.apk) {
    // No APK asset: fall back to the release page (user downloads manually).
    window.open(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, '_blank');
    return;
  }
  // Non-Android (web + iOS): no native installer plugin — open the download / release page.
  if (!isNative() || Capacitor.getPlatform() !== 'android') {
    window.open(rel.apk.browser_download_url, '_blank');
    return;
  }
  const sub = await UpdatePlugin.addListener('downloadProgress', (e) => { onProgress?.(e.received, e.total); });
  try {
    const r = await UpdatePlugin.download({ url: rel.apk.browser_download_url, fileName: rel.apk.name });
    await UpdatePlugin.openInstaller({ uri: r.uri });
  } finally {
    await sub.remove().catch(() => {});
  }
}

export { APP_VERSION };
