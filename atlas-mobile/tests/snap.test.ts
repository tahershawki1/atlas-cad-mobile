import { describe, expect, it } from 'vitest';
import { CadDoc } from '../src/cad/doc/CadDoc';
import { defaultSnapSettings, findSnap } from '../src/cad/tools/snap';
import { emptyDrawing } from '../src/cad/model/types';

describe('command-point object snaps', () => {
  it('snaps command taps to line endpoints, midpoints, and nearest points', () => {
    const drawing = emptyDrawing('snap');
    drawing.entities = [{
      id: 1,
      type: 'line',
      layer: '0',
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
    }];
    const doc = new CadDoc(drawing);
    const settings = defaultSnapSettings();

    expect(settings.enabled).toBe(true);
    expect(settings.kinds.nearest).toBe(true);
    expect(findSnap({ x: 0.1, y: 0.1 }, { doc, settings, tol: 1 })?.kind).toBe('end');
    expect(findSnap({ x: 5.1, y: 0.1 }, { doc, settings, tol: 1 })?.kind).toBe('mid');
    const onLine = findSnap({ x: 3.4, y: 0.2 }, { doc, settings, tol: 1 });
    expect(onLine?.kind).toBe('nearest');
    expect(onLine?.p.x).toBeCloseTo(3.4);
    expect(onLine?.p.y).toBeCloseTo(0);
  });
});
