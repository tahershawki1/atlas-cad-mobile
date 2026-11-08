import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/store';
import { Icon, Logo } from './icons';
import { initSession, can } from '../auth/session';
import { isIOS } from '../platform/ios';
import { listProjects, createProject, importDrawingFile, openProject, newBlankDrawing, deleteProject } from '../data/projects';
import type { ProjectRow } from '../data/db';
import { ask, confirmDialog } from '../app/dialogs';
import { useT } from '../app/i18n';

export function StartScreen() {
  const t = useT();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingProject = useRef<string | null>(null);
  const toast = useApp((s) => s.toast);

  useEffect(() => { void initSession(); refresh(); }, []);
  const refresh = () => listProjects().then(setProjects);

  // developer convenience: ?sample=<url>&devseed=1 (test data from src/dev/seed.ts)
  useEffect(() => {
    const q = new URLSearchParams(import.meta.env.DEV ? location.search : '');
    const sample = q.get('sample');
    if (sample && !(window as any).__sampleLoaded) {
      (window as any).__sampleLoaded = true;
      (async () => {
        const name = decodeURIComponent(sample.split('/').pop()!);
        const existing = (await listProjects()).find((p) => p.name === name);
        if (existing && existing.activeDrawingId && !q.get('fresh')) { await openProject(existing.id); return; }
        useApp.setState({ loading: 'Downloading sample…' });
        const res = await fetch(sample);
        const bytes = new Uint8Array(await res.arrayBuffer());
        useApp.setState({ loading: null });
        const p = await createProject({ name });
        await importDrawingFile(p.id, name, bytes);
        await openProject(p.id);
      })().catch((e) => { useApp.setState({ loading: null }); toast(e.message, 'error'); });
    }
  }, []);

  const handleFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!/\.(dwg|dxf)$/i.test(f.name)) { toast('Please choose a .dwg or .dxf file', 'error'); return; }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let pid = pendingProject.current;
      pendingProject.current = null;
      if (!pid) {
        // Open directly in CAD: the drawing filename becomes the local project name.
        // No project form is shown before the map.
        const name = f.name.replace(/\.(dwg|dxf)$/i, '') || 'Drawing';
        pid = (await createProject({ name })).id;
      }
      await importDrawingFile(pid, f.name, bytes);
      await openProject(pid);
    } catch (e) {
      useApp.setState({ loading: null });
      toast((e as Error).message, 'error');
    }
  };

  const newEmpty = async () => {
    const r = await ask('New blank project', [{ key: 'name', label: 'Project name', value: 'New ATLAS project' }], { okLabel: 'Create' });
    if (!r) return;
    const p = await createProject({ name: r.name });
    await newBlankDrawing(p.id, 'Drawing 1');
    await openProject(p.id);
  };

  return (
    <div className="start" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files); }}>
      <div className="start-inner">
        <div className="hero">
          <Logo size={56} />
          <div className="grow">
            <h1>ATLAS CAD</h1>
            <p>{t('ATLAS CAD — your DWG is the map.')}</p>
          </div>
        </div>
        <>
            <div className="start-actions">
              <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={!can('project.manage') && !can('cad.edit')}><Icon name="import" />{t('Open DWG / DXF')}</button>
              <button className="btn" onClick={newEmpty} disabled={!can('project.manage')} title={t('New blank project')}><Icon name="plus" />{t('New blank project')}</button>
              <input ref={fileRef} type="file" accept={isIOS() ? undefined : '.dwg,.dxf'} style={{ display: 'none' }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
            </div>
            <div className={`dropzone ${over ? 'over' : ''}`} style={{ marginBottom: 20 }}>
              {t('Drop a DWG or DXF file here. The original is stored read-only; you always edit a project copy.')}
            </div>
            <div className="section">{t('Projects')} ({projects.length})</div>
            {projects.length === 0 ? <div className="empty">No projects yet.</div> : (
              <div className="proj-grid">
                {projects.map((p) => (
                  <div key={p.id} className="proj-card" onClick={() => openProject(p.id).catch((e) => toast(e.message, 'error'))}>
                    <div className="row"><Icon name="folder" /><h4 className="grow">{p.name}</h4>
                      {can('project.manage') && <button className="icon-btn" style={{ minWidth: 32, height: 32 }} title="Delete project" onClick={async (e) => {
                        e.stopPropagation();
                        if (await confirmDialog('Delete project', `Delete "${p.name}" and all its drawings and versions from this device?`, true, 'Delete')) { await deleteProject(p.id); refresh(); }
                      }}><Icon name="trash" /></button>}
                    </div>
                    {p.code && <div className="small muted">Code: {p.code}</div>}
                    {p.client && <div className="small muted">Client: {p.client}</div>}
                    <div className="small muted">Updated {new Date(p.updatedAt).toLocaleString()}</div>
                    <div className="row"><button className="btn sm" onClick={(e) => { e.stopPropagation(); pendingProject.current = p.id; fileRef.current?.click(); }}><Icon name="import" />Add drawing</button></div>
                  </div>
                ))}
              </div>
            )}
        </>
      </div>
    </div>
  );
}
