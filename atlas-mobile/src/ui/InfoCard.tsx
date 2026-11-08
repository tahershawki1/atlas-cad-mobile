import React from 'react';
import { useApp } from '../app/store';
import { app } from '../app/controller';
import { Icon } from './icons';
import { fmt } from './common';
import { entityLength } from '../cad/edit/measure';
import { InfoExtensions } from './infoExtensions';

/** Quick info for the tapped entity. */
export function InfoCard() {
  const id = useApp((s) => s.infoEntity);
  useApp((s) => s.docRev);
  const toolId = useApp((s) => s.toolId);
  if (id === null || toolId !== 'select') return null;
  const doc = app.doc;
  const e = doc?.get(id);
  if (!e) return null;
  const len = entityLength(e);
  const upm = app.unitsPerMeter();
  const close = () => useApp.setState({ infoEntity: null });
  const select = () => app.selection?.set([id]);
  const startTool = (tool: 'move' | 'copy') => { select(); app.setTool(tool); };
  const openProperties = () => { select(); useApp.setState({ panel: 'props' }); };
  const deleteEntity = () => { select(); app.deleteSelection(); close(); };
  return (
    <div className="info-card">
      <h4>
        <span className="grow">{e.type === 'insert' ? `Block: ${e.block}` : e.type.toUpperCase()}</span>
        <button className="icon-btn" style={{ minWidth: 32, height: 32 }} onClick={close}><Icon name="close" /></button>
      </h4>
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <button className="btn sm" onClick={openProperties}><Icon name="props" />Properties</button>
        <button className="btn sm" onClick={() => startTool('move')}><Icon name="move" />Move</button>
        <button className="btn sm" onClick={() => startTool('copy')}><Icon name="copy" />Copy</button>
        <button className="btn sm danger" onClick={deleteEntity}><Icon name="trash" />Delete</button>
      </div>
      <div className="kv">
        {len !== null && <><div>Length</div><div>{fmt(len, 3)} du{upm !== 1 ? ` · ${fmt(len / upm, 2)} m` : ''}</div></>}
        {e.type === 'point' && <><div>X</div><div className="mono">{fmt(e.p.x, 3)}</div><div>Y</div><div className="mono">{fmt(e.p.y, 3)}</div></>}
      </div>
      <InfoExtensions entityId={id} />
    </div>
  );
}
