import { registerPanel } from './PanelHost';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { DrawPanel, EditPanel, TextPanel, MeasurePanel } from './ToolPanels';
import { SearchPanel } from './SearchPanel';
import { ExportPanel } from './ExportPanel';
import { ProjectPanel, VersionsPanel, SettingsPanel, MorePanel } from './ProjectPanels';
import { GpsPanel, CalibrationPanel } from '../gps/GpsPanels';
import { UpdatePanel } from './UpdatePanel';

registerPanel('layers', { title: 'Layer Manager', component: LayersPanel, tall: true });
registerPanel('props', { title: 'Properties', component: PropertiesPanel, tall: true });
registerPanel('draw', { title: 'Draw', component: DrawPanel });
registerPanel('edit', { title: 'Modify', component: EditPanel });
registerPanel('text', { title: 'Text', component: TextPanel });
registerPanel('measure', { title: 'Measure', component: MeasurePanel });
registerPanel('search', { title: 'Search', component: SearchPanel, tall: true });
registerPanel('export', { title: 'Export', component: ExportPanel });
registerPanel('project', { title: 'Project', component: ProjectPanel, tall: true });
registerPanel('versions', { title: 'Versions', component: VersionsPanel, tall: true });
registerPanel('settings', { title: 'Settings', component: SettingsPanel, tall: true });
registerPanel('more', { title: 'More', component: MorePanel });
registerPanel('gps', { title: 'GPS', component: GpsPanel, tall: true });
registerPanel('calib', { title: 'Calibration Wizard', component: CalibrationPanel, tall: true });
registerPanel('update', { title: 'Software Update', component: UpdatePanel, tall: true });

// Users / sync (optional platform panels)
import { UsersPanel, SyncPanel } from './AdminPanels';
registerPanel('users', { title: 'Users, Roles & Audit', component: UsersPanel, tall: true });
registerPanel('sync', { title: 'Cloud Sync', component: SyncPanel });

// dev-only handle on the live module instances (used by automated UI tests)
import * as __projects from '../../data/projects';
import * as __gps from '../../gps/controller';
import * as __reports from '../../reports/reports';
import * as __sync from '../../data/sync';
if (import.meta.env.DEV) (window as any).__fl = { projects: __projects, gps: __gps, reports: __reports, sync: __sync };
