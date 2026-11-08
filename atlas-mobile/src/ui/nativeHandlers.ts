import { app } from '../app/controller';
import { useApp } from '../app/store';
import { installNativeHandlers } from '../platform/native';

/**
 * CAD-only native handlers (replaces the old FTTH integration):
 * - "Open with ATLAS CAD" for .dwg/.dxf files (Files, WhatsApp, Mail…)
 * - atlas:// deep links (atlas://open/<filename> or atlas://project/<projectId>)
 * - Android back button: tool → panel → info card → minimize
 * Installed once at startup (from main.tsx). Safe no-op on web.
 */
export function installAtlasNativeHandlers() {
  installNativeHandlers({
    onUrl: async (url) => {
      const fileName = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() ?? '');
      if (/^(file|content):/i.test(url) && /\.(dwg|dxf)$/i.test(fileName)) {
        try {
          const { Filesystem } = await import('../platform/native');
          const r = await Filesystem.readFile({ path: url });
          const bytes = typeof r.data === 'string' ? Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)) : new Uint8Array(await r.data.arrayBuffer());
          const { createProject, importDrawingFile } = await import('../data/projects');
          const { openProject } = await import('../data/projects');
          const p = await createProject({ name: fileName.replace(/\.(dwg|dxf)$/i, '') });
          await importDrawingFile(p.id, fileName, bytes);
          await openProject(p.id);
        } catch (e) {
          useApp.setState({ loading: null });
          useApp.getState().toast(`Cannot open ${fileName}: ${(e as Error).message}`, 'error');
        }
        return;
      }
      if (url.startsWith('atlas://')) {
        const m = /^atlas:\/\/project\/([^/?#]+)/.exec(url);
        if (m) {
          try {
            const { openProject } = await import('../data/projects');
            const { db } = await import('../data/db');
            const id = m[1];
            if (await db.projects.get(id)) await openProject(id);
          } catch { /* ignore */ }
        }
      }
      // Legacy fiberlens:// (pre-cleanup links): same project handling
      const m2 = /^fiberlens:\/\/project\/([^/?#]+)/.exec(url);
      if (m2) {
        try {
          const { openProject } = await import('../data/projects');
          const { db } = await import('../data/db');
          if (await db.projects.get(m2[1])) await openProject(m2[1]);
        } catch { /* ignore */ }
      }
    },
    onBack: () => {
      const st = useApp.getState();
      if (app.tools?.active && app.tools.active.id !== 'select') {
        if (app.tools.active.id === 'mcoords') app.tools.active.escape();
        else app.setTool('select');
        return true;
      }
      if (st.panel) { st.set({ panel: null }); return true; }
      if (st.infoEntity !== null) { st.set({ infoEntity: null }); return true; }
      return false;
    },
  });
}
