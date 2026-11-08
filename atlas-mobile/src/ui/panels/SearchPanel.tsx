import React, { useEffect, useRef, useState } from 'react';
import { searchAll, openHit, type SearchHit } from '../../app/search';
import { Icon } from '../icons';

const KIND_BADGE: Record<string, string> = { Text: '', Attribute: 'info', Block: '', Layer: '' };

export function SearchPanel() {
  const [q, setQ] = useState(() => sessionStorage.getItem('atlas.search') ?? '');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  useEffect(() => {
    sessionStorage.setItem('atlas.search', q);
    const t = setTimeout(async () => { setBusy(true); setHits(await searchAll(q)); setBusy(false); }, 220);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input ref={inp} className="grow" placeholder="Text, attribute, layer, block…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) openHit(hits[0]); }} dir="auto" />
      </div>
      {busy && <div className="small muted">Searching…</div>}
      {!busy && q && !hits.length && <div className="empty">No match for “{q}”.</div>}
      {!q && <div className="small muted">Search any DWG text, block attribute or layer name. Press Enter to jump to the best match.</div>}
      <div className="list">
        {hits.map((h) => (
          <div key={h.key} className="list-item" onClick={() => openHit(h)}>
            <Icon name={h.kind === 'Layer' ? 'layers' : h.kind === 'Text' ? 'text' : 'pin'} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} dir="auto">{h.title}</div>
              <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.subtitle}</div>
            </div>
            <span className={`badge ${KIND_BADGE[h.kind] ?? ''}`}>{h.kind}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
