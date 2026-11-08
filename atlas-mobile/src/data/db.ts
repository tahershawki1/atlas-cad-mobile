import Dexie, { type Table } from 'dexie';
import type { TrackPoint } from '../gps/gpsStore';
import type { Calibration } from '../geo/calibration';

export type Role = 'admin' | 'engineer' | 'designer' | 'technician' | 'viewer';

export interface Syncable { projectId: string; updatedAt: number; updatedBy?: string; rev?: number; deleted?: boolean }

export interface UserRow { id: string; username: string; displayName: string; role: Role; pwdHash: string; salt: string; active: boolean; createdAt: number; lastLogin?: number }
export interface ProjectRow { id: string; name: string; code?: string; client?: string; location?: string; createdAt: number; updatedAt: number; ownerId?: string; activeDrawingId?: string; settings?: Record<string, any>; thumb?: string }
export interface ProjectMemberRow { projectId: string; userId: string; role: Role }
export interface FileRow { id: string; projectId: string; kind: 'original' | 'attachment' | 'export' | 'report'; name: string; mime: string; size: number; sha256: string; data: Uint8Array; createdAt: number; createdBy?: string }
export interface DrawingRow { id: string; projectId: string; name: string; originalFileId: string | null; snapshot: Uint8Array; journalSeq: number; snapshotAt: number; calibrationId?: string; entityCount: number; updatedAt: number }
export interface JournalRow { drawingId: string; seq: number; tx: any; kind: 'do' | 'undo' | 'redo'; userId?: string; at: number }
export interface VersionRow { id: string; projectId: string; drawingId: string; number: number; label: string; kind: 'design' | 'asbuilt' | 'import' | 'restore'; snapshot: Uint8Array; createdAt: number; userId?: string; userName?: string; summary: string; parentId?: string; entityCount: number }
export interface CalibrationRow extends Calibration { projectId: string }
export interface TrackRow { id: string; projectId: string; name: string; startedAt: number; endedAt: number; points: TrackPoint[]; userId?: string; length: number }
export interface ReportRow { id: string; projectId: string; kind: string; name: string; createdAt: number; fileId?: string }
export interface AuditRow { seq?: number; at: number; userId?: string; userName?: string; projectId?: string; action: string; target?: string; details?: string }
export interface OutboxRow { seq?: number; table: string; rowId: string; op: 'put' | 'delete'; hlc: string; projectId?: string; payload?: any }
export interface SettingRow { key: string; value: any }

export class FiberLensDB extends Dexie {
  users!: Table<UserRow, string>;
  projects!: Table<ProjectRow, string>;
  projectMembers!: Table<ProjectMemberRow, [string, string]>;
  files!: Table<FileRow, string>;
  drawings!: Table<DrawingRow, string>;
  journal!: Table<JournalRow, [string, number]>;
  versions!: Table<VersionRow, string>;
  calibrations!: Table<CalibrationRow, string>;
  tracks!: Table<TrackRow, string>;
  reports!: Table<ReportRow, string>;
  auditLog!: Table<AuditRow, number>;
  syncOutbox!: Table<OutboxRow, number>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'fiberlens') {
    super(name);
    this.version(1).stores({
      users: 'id, &username, role',
      projects: 'id, name, updatedAt',
      projectMembers: '[projectId+userId], projectId, userId',
      files: 'id, projectId, kind',
      drawings: 'id, projectId',
      journal: '[drawingId+seq], drawingId',
      versions: 'id, projectId, drawingId, createdAt, [drawingId+number]',
      calibrations: 'id, projectId, drawingId',
      tracks: 'id, projectId, startedAt',
      reports: 'id, projectId, createdAt',
      auditLog: '++seq, at, projectId, userId, action',
      syncOutbox: '++seq, table, projectId',
      settings: 'key',
    });
    // ATLAS CAD-only: drop FTTH + field tables from v1 (CAD data is kept).
    this.version(2).stores({
      ftthObjects: null,
      cables: null,
      cores: null,
      splitters: null,
      splices: null,
      photos: null,
      notes: null,
      surveys: null,
      surveyItems: null,
      faults: null,
      maintenance: null,
      detectRules: null,
    });
  }
}

export const db = new FiberLensDB();

export const uid = () => (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function getSetting<T>(key: string, def: T): Promise<T> {
  const r = await db.settings.get(key);
  return r ? (r.value as T) : def;
}
export async function setSetting(key: string, value: any) { await db.settings.put({ key, value }); }
