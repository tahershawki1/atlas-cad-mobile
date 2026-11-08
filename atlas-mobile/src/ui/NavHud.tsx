import React, { useEffect, useState } from 'react';
import { useGps } from '../gps/gpsStore';
import { gpsController } from '../gps/controller';
import { app } from '../app/controller';
import { fmt } from './common';
import { Icon } from './icons';

/** CAD navigation HUD: direction/distance to a CAD target (no FTTH). */
export function NavHud() {
  const g = useGps();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!g.navTarget) return null;
  const info = gpsController.navInfo(g.navTarget.x, g.navTarget.y);
  if (!info) return null;
  const arrived = info.dist < Math.max(3, (g.fix?.accuracy ?? 5));
  return (
    <div className="nav-hud">
      <svg viewBox="0 0 24 24" className="arrow" style={{ transform: `rotate(${-info.screenAngle * 180 / Math.PI + 90}deg)` }}><path d="M12 2l7 18-7-4-7 4 7-18z" fill="#fff" /></svg>
      <div><div style={{ fontSize: 12, opacity: 0.85 }}>Navigate to {g.navTarget.name}</div><div style={{ fontSize: 20 }}>{arrived ? 'Arrived ✓' : `${fmt(info.dist, info.dist < 100 ? 1 : 0)} m`} <span style={{ fontSize: 12, opacity: 0.85 }}>{Math.round(info.bearing)}°</span></div></div>
      <button className="btn sm" onClick={() => app.view?.centerOn(g.navTarget!.x, g.navTarget!.y)}>Center</button>
      <button className="btn sm" onClick={() => gpsController.setNavTarget(null)}><Icon name="close" /></button>
    </div>
  );
}
