import { db } from '../data/db';
import type { Row } from './tables';
import { listVersions, currentDrawingId } from '../data/projects';
import { unpackDrawing } from '../data/drawingCodec';
import { app } from '../app/controller';
import type { Entity } from '../cad/model/types';

export interface ReportDef { id: string; title: string; description: string; build: (projectId: string) => Promise<{ title: string; rows: Row[] }[]> }

const d = (t?: number) => (t ? new Date(t).toLocaleString() : '');

function entityStats(entities: Entity[]): Row[] {
  const byType = new Map<string, number>();
  const byLayer = new Map<string, number>();
  for (const e of entities) {
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    byLayer.set(e.layer, (byLayer.get(e.layer) ?? 0) + 1);
  }
  return [
    { title: 'Entities by type', rows: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ Type: type, Count: count })) },
    { title: 'Entities by layer', rows: [...byLayer.entries()].sort((a, b) => b[1] - a[1]).map(([layer, count]) => ({ Layer: layer, Count: count })) },
  ];
}

function diffSummary(prev: Entity[], cur: Entity[]): Row[] {
  const key = (e: Entity) => (e.handle ? 'h' + e.handle : 'i' + e.id);
  const pm = new Map(prev.map((e) => [key(e), e]));
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const e of cur) {
    const k = key(e);
    seen.add(k);
    const p = pm.get(k);
    if (!p) rows.push({ Change: 'Added', Type: e.type, Layer: e.layer });
    else if (JSON.stringify({ ...p, id: 0 }) !== JSON.stringify({ ...e, id: 0 })) rows.push({ Change: 'Modified', Type: e.type, Layer: e.layer });
  }
  for (const e of prev) if (!seen.has(key(e))) rows.push({ Change: 'Removed', Type: e.type, Layer: e.layer });
  return rows;
}

export const REPORTS: ReportDef[] = [
  { id: 'drawing', title: 'Drawing Summary', description: 'Entity and layer counts for the open drawing', build: async () => {
    const doc = app.doc;
    if (!doc) return [{ title: 'Drawing', rows: [{ Item: 'No drawing open', Count: 0 }] }];
    const drawing = doc.live();
    return [
      { title: 'Summary', rows: [
        { Item: 'Drawing', Count: drawing.meta.name },
        { Item: 'Entities', Count: drawing.entities.length },
        { Item: 'Layers', Count: drawing.layers.length },
        { Item: 'Blocks', Count: drawing.blocks?.length ?? doc.drawing.blocks?.length ?? 0 },
      ] },
      ...entityStats(drawing.entities),
    ];
  } },
  { id: 'asbuilt', title: 'As-Built Report (CAD)', description: 'CAD entities added, modified or removed vs the last design version', build: async () => {
    const did = currentDrawingId();
    const cur = app.doc?.live();
    if (!did || !cur) return [{ title: 'As-Built', rows: [{ Item: 'No drawing open', Count: 0 }] }];
    const vs = (await listVersions(did)).filter((v) => v.kind === 'design' || v.kind === 'import');
    const v = vs[0];
    if (!v) return [{ title: 'Design vs As-Built', rows: [{ Item: 'No baseline design version', Count: 0 }] }];
    const prev = unpackDrawing(v.snapshot).entities;
    const rows = diffSummary(prev, cur.entities);
    return [{ title: `Design (${v.label}) vs Current`, rows }];
  } },
  { id: 'gps', title: 'GPS Report', description: 'GPS tracks, calibration and control points', build: async (pid) => {
    const tracks = await db.tracks.where('projectId').equals(pid).toArray();
    const cals = await db.calibrations.where('projectId').equals(pid).toArray();
    return [
      { title: 'Calibration', rows: cals.flatMap((c) => c.points.map((p) => ({ CRS: c.crs, Mode: c.mode, Method: c.method, 'RMS (du)': +c.rms.toFixed(3), Point: p.name, 'CAD X': p.cad.x, 'CAD Y': p.cad.y, Lat: p.lat, Lon: p.lon, 'Residual (du)': p.residual !== undefined ? +p.residual.toFixed(3) : '', Enabled: p.enabled ? 'yes' : 'no' }))) },
      { title: 'Tracks', rows: tracks.map((t) => ({ Name: t.name, Points: t.points.length, 'Length (m)': +t.length.toFixed(1), Start: d(t.startedAt), End: d(t.endedAt) })) },
      { title: 'Track points', rows: tracks.flatMap((t) => t.points.map((p) => ({ Track: t.name, Time: d(p.t), Lat: p.lat, Lon: p.lon, 'Acc (m)': +p.acc.toFixed(1), X: p.x !== undefined ? +p.x.toFixed(3) : '', Y: p.y !== undefined ? +p.y.toFixed(3) : '', 'Speed (km/h)': p.spd !== undefined ? +(p.spd * 3.6).toFixed(1) : '' }))) },
    ];
  } },
];
