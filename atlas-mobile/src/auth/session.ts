import { create } from 'zustand';
import type { Role } from '../data/db';

export type Permission =
  | 'view' | 'export' | 'measure'
  | 'calibrate'
  | 'cad.edit'
  | 'version.manage' | 'project.manage' | 'users.manage' | 'reports';

export const ROLE_PERMS: Record<Role, Permission[]> = {
  viewer: ['view', 'export', 'measure'],
  technician: ['view', 'export', 'measure', 'calibrate'],
  designer: ['view', 'export', 'measure', 'calibrate', 'cad.edit', 'reports'],
  engineer: ['view', 'export', 'measure', 'calibrate', 'cad.edit', 'version.manage', 'reports', 'project.manage'],
  admin: ['view', 'export', 'measure', 'calibrate', 'cad.edit', 'version.manage', 'reports', 'project.manage', 'users.manage'],
};

export const ROLE_LABEL: Record<Role, string> = { admin: 'Owner', engineer: 'Owner', designer: 'Owner', technician: 'Owner', viewer: 'Owner' };

/** Anonymous local mode: there are no accounts, passwords, roles, or login screens. */
interface SessionState { user: null; ready: boolean; needsSetup: false; projectRole: null; set: (p: Partial<SessionState>) => void }
export const useSession = create<SessionState>((set) => ({ user: null, ready: true, needsSetup: false, projectRole: null, set: (p) => set(p) }));

export async function initSession() { useSession.getState().set({ ready: true }); }
export function currentRole(): Role { return 'admin'; }

export function can(p: Permission): boolean {
  void p;
  return true;
}

/** throws (with a friendly message) when the current user lacks a permission */
export function require(p: Permission): void {
  void p;
}

export async function audit(action: string, target?: string, details?: string, projectId?: string) {
  try {
    const { db } = await import('../data/db');
    await db.auditLog.add({ at: Date.now(), projectId: projectId ?? (window as any).__atlasProjectId, action, target, details });
  } catch { /* never block on audit */ }
}
