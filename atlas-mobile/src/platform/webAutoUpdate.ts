/** Keep the installed web UI on the newest service-worker version. */
export function installWebAutoUpdate(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;

  let reloading = false;
  const activateWaiting = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new worker has taken control. Reload once so the page uses its files.
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
    activateWaiting(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) activateWaiting(registration);
      });
    });

    // Browsers check on navigation, but a field app can stay open for days.
    const check = () => registration.update().catch(() => {});
    window.setInterval(check, 5 * 60 * 1000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }).catch(() => { /* offline mode unavailable */ });
}
