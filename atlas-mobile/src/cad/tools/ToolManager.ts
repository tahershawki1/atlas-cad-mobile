import type { CadView } from '../render/CadView';
import type { CadDoc } from '../doc/CadDoc';
import type { Vec2 } from '../model/types';
import { Tool, type ToolEvent, type ToolHost } from './types';
import { findSnap, applyOrtho, drawSnapMarker, type SnapSettings, type SnapResult } from './snap';

export interface InteractionSettings {
  snap: SnapSettings;
  ortho: boolean;
  /** current GPS position in drawing coordinates (for GPS snap) */
  gps: () => Vec2 | null;
}

type ToolFactory = () => Tool;
type DownMode = 'none' | 'pan' | 'drag' | 'pinch' | 'precise';

/**
 * DWG FastView parity constants (MyCADView.onTouchEvent + GestureHandler):
 * - 2px / 200ms: flicker / jitter suppression (isReturnFromMove)
 * - 0.0368 px/ms: velocity threshold to distinguish tap from drag
 * - MinSpan / SpanSlop: pinch start slop to prevent jitter zoom
 */
const DWG_FLICKER_DIST_PX = 2;
const DWG_FLICKER_TIME_MS = 200;
const DWG_VELOCITY_PX_PER_MS = 0.03683671024828522;
const DWG_PINCH_MIN_SPAN_PX = 24;
const DWG_PINCH_SPAN_SLOP_PX = 10;
/** Android ViewConfiguration scaledTouchSlop (px, CSS). DWG uses 2px jitter + velocity, we use 10px dead-zone for human fingers. */
const TOUCH_SLOP_PX = 10;
const MOUSE_SLOP_PX = 3;

/**
 * Routes pointer/keyboard input to the active tool and drives camera gestures
 * (wheel zoom, pinch zoom, pan). Works with mouse, pen and touch.
 * Touch behaviour mirrors DWG FastView MyCADView/GestureHandler:
 * single-finger pans only in View mode (IsCanSingleMove), two-finger always
 * pans/zooms, NO fling inertia, tap vs pan decided by velocity + 200ms window.
 */
export class ToolManager {
  private factories = new Map<string, ToolFactory>();
  active: Tool | null = null;
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  /** Once a second touch joins a gesture, block all tool input until every finger lifts. */
  private gestureBlocked = false;
  private down: { ev: ToolEvent; x: number; y: number; t: number; button: number; moved: boolean; mode: DownMode } | null = null;
  private pinch: { d: number; cx: number; cy: number; startD: number; active: boolean } | null = null;
  private longPressTimer: any = 0;
  private snapFeedbackTimer: any = 0;
  private snapFeedback = false;
  private longPressArmed = false;
  // ---- DWG parity state (MyCADView fields) ----
  /** 0=NONE, 1=DRAG single, 2=PINCH (MyCADView.mode) */
  private dwgMode: 0 | 1 | 2 = 0;
  private dwgStartX = 0;
  private dwgStartY = 0;
  private dwgCurrentTime = 0;
  /** decision-once counter per gesture (MyCADView.control) */
  private dwgControl = 0;
  private isTwos = false;
  private isPointSelected = false;
  private isfirstDown = true;
  private isReturnFromMove = false;
  /** hold state: second finger simulated while single finger stays (hh) */
  private hh = false;
  /** "Single move" toggle like DWG MyCADView.isSingleMove / setSingleMove */
  isSingleMove = false;
  /** fullscreen (layout/view-only) like DWG bFullScreen */
  private bFullScreen = false;
  private lastCompleteTime = 0;
  lastEvent: ToolEvent | null = null;
  lastSnap: SnapResult | null = null;
  private mouseInside = false;
  onCursor: ((p: Vec2) => void) | null = null;
  onToolChange: ((t: Tool | null) => void) | null = null;
  lastPointerType = 'mouse';
  /** touch precision mode (long-press in drawing tools): cursor above the finger + loupe */
  preciseEv: ToolEvent | null = null;
  static PRECISE_OFFSET = 80;

  constructor(
    public view: CadView,
    private el: HTMLElement,
    public host: Omit<ToolHost, 'finish'> & { finish?: () => void },
    public settings: InteractionSettings,
  ) {
    (this.host as ToolHost).finish = () => this.setTool('select');
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', () => { this.mouseInside = false; this.view.invalidateOverlay(); });
    el.addEventListener('pointerenter', () => { this.mouseInside = true; });
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dblclick', this.onDblClick);
    window.addEventListener('keydown', this.onKey);
    view.addOverlay('tool', (ctx, cam) => {
      this.active?.overlay(ctx, cam);
      const s = this.lastSnap;
      // Do not show a snap arrow while a finger is simply navigating the map.
      // Snap feedback is intentional only in mouse mode or after long-press
      // precision mode has displayed the loupe.
      if (s && (this.lastPointerType !== 'touch' || this.preciseEv || this.snapFeedback)) {
        const p = cam.worldToScreen(s.p.x, s.p.y); drawSnapMarker(ctx, p.x, p.y, s.kind);
      }
      if (this.preciseEv) this.drawLoupe(ctx, cam);
      // crosshair for mouse
      if (this.lastEvent && this.mouseInside && this.lastPointerType === 'mouse' && this.active && this.active.id !== 'select') {
        const p = this.lastSnap ? cam.worldToScreen(this.lastSnap.p.x, this.lastSnap.p.y) : { x: this.lastEvent.sx, y: this.lastEvent.sy };
        ctx.save();
        ctx.strokeStyle = this.view.opts.dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 24, p.y); ctx.lineTo(p.x + 24, p.y); ctx.moveTo(p.x, p.y - 24); ctx.lineTo(p.x, p.y + 24);
        ctx.stroke();
        ctx.restore();
      }
    }, 50);
  }

  /** magnifier for touch precision placement */
  private drawLoupe(ctx: CanvasRenderingContext2D, cam: import('../render/camera').Camera) {
    const ev = this.preciseEv!;
    const target = this.lastSnap ? cam.worldToScreen(this.lastSnap.p.x, this.lastSnap.p.y) : { x: ev.sx, y: ev.sy };
    const R = 70, zoom = 2.5, src = (R * 2) / zoom;
    const left = target.x < cam.width / 2 && target.y < 220;
    // keep the loupe clear of the command bar
    const bar = this.el.parentElement?.querySelector('.promptbar .prompt') as HTMLElement | null;
    const top = bar ? bar.getBoundingClientRect().bottom - this.el.getBoundingClientRect().top + 10 : 14;
    const cx = left ? cam.width - R - 14 : R + 14, cy = top + R;
    const dpr = cam.dpr;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = this.view.opts.dark ? '#0d1117' : '#ffffff'; ctx.fill();
    ctx.clip();
    for (const c of [this.view.glCanvas, this.view.textCanvas]) {
      try { ctx.drawImage(c, (target.x - src / 2) * dpr, (target.y - src / 2) * dpr, src * dpr, src * dpr, cx - R, cy - R, R * 2, R * 2); } catch { /* ignore */ }
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = this.lastSnap ? '#ffd400' : '#2ea8ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#ff3b6b';
    ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
    // cursor above the finger
    ctx.beginPath(); ctx.arc(target.x, target.y, 9, 0, Math.PI * 2); ctx.moveTo(target.x - 18, target.y); ctx.lineTo(target.x + 18, target.y); ctx.moveTo(target.x, target.y - 18); ctx.lineTo(target.x, target.y + 18); ctx.stroke();
    if (this.lastSnap) { ctx.fillStyle = '#ffd400'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.lastSnap.kind.toUpperCase(), cx, cy + R - 10); }
    ctx.restore();
  }

  register(id: string, f: ToolFactory) { this.factories.set(id, f); }
  has(id: string) { return this.factories.has(id); }

  setTool(id: string | Tool) {
    this.active?.deactivate();
    let t: Tool | null;
    if (typeof id === 'string') {
      const f = this.factories.get(id);
      t = f ? f() : null;
    } else t = id;
    this.active = t;
    this.lastSnap = null;
    if (t) t.activate(this.host as ToolHost);
    this.view.invalidateOverlay();
    this.onToolChange?.(t);
  }

  get doc(): CadDoc | null { return this.view.doc; }

  private makeEvent(e: PointerEvent | MouseEvent, snap = true, offsetY = 0): ToolEvent {
    const r = this.el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top - offsetY;
    const raw = this.view.cam.screenToWorld(sx, sy);
    let p = raw;
    let s: SnapResult | null = null;
    const tool = this.active;
    const pointerType = (e as PointerEvent).pointerType ?? 'mouse';
    const doc = this.doc;
    if (snap && tool?.wantsSnap && doc) {
      const tolPx = pointerType === 'touch' ? 26 : 12;
      s = findSnap(raw, { doc, settings: this.settings.snap, tol: tolPx / this.view.cam.scale, base: tool.basePoint, gps: this.settings.gps() });
      if (s) p = s.p;
    }
    if (!s && tool?.basePoint && (this.settings.ortho !== e.shiftKey) && tool.wantsSnap) {
      p = applyOrtho(raw, tool.basePoint, this.view.cam.rotation);
    }
    return { sx, sy, raw, p, snap: s, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, pointerType };
  }

  /** DWG IsCanSingleMove: single finger pans only in View mode / select / PAN-ZOOM, never while a draw/edit command runs. */
  isCanSingleMove(): boolean {
    if (this.bFullScreen) return true;
    const cur = this.active?.id;
    if (cur === 'pan' || cur === 'zoom') return true;
    if (this.isSingleMove) return true;
    return false;
  }

  /** DWG MyCADView.isDowmPoint() === hasCommandExecutingNow(): a command is currently consuming input. */
  isDowmPoint(): boolean {
    const cur = this.active?.id;
    return !!cur && cur !== 'select' && cur !== 'pan' && cur !== 'zoom';
  }

  setSingleMove(v: boolean) { this.isSingleMove = v; }
  setFullScreen(v: boolean) { this.bFullScreen = v; }

  private onDown = (e: PointerEvent) => {
    try { this.el.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    this.lastPointerType = e.pointerType;
    const now = performance.now();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.pointers.size === 2) {
      // ACTION_POINTER_DOWN (5): navigation only. Preserve the active command
      // and its base point; a pinch must never become an edit/copy destination.
      clearTimeout(this.longPressTimer);
      this.gestureBlocked = true;
      this.preciseEv = null;
      this.lastSnap = null;
      const [a, b] = [...this.pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinch = { d: span, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, startD: span, active: false };
      this.dwgMode = 2;
      this.isTwos = true;
      this.isPointSelected = true;
      if (this.down) this.down.mode = 'pinch';
      return;
    }
    if (this.pointers.size > 2) return;
    // DWG ACTION_DOWN: save anchor + time, mode=1, defer until proven tap vs drag
    this.dwgMode = 1;
    this.dwgStartX = e.clientX;
    this.dwgStartY = e.clientY;
    this.dwgCurrentTime = now;
    this.dwgControl = 0;
    this.isReturnFromMove = false;
    this.hh = false;
    this.isPointSelected = false;
    if (this.isDowmPoint() || !this.isCanSingleMove()) {
      this.isfirstDown = false;
    } else {
      this.isfirstDown = true;
    }
    // DWG bFullScreen: paper-space layout is view-only, single finger always pans
    this.bFullScreen = !!this.view.layout;
    const ev = this.makeEvent(e);
    this.down = { ev, x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, moved: false, mode: 'none' };
    if (e.button === 1 || e.button === 2 || this.view.layout) { this.down.mode = 'pan'; return; }
    if (e.pointerType === 'touch' && !this.isSingleMove && this.active && this.active.id !== 'select' && !this.active.wantsDrag) {
      this.longPressTimer = setTimeout(() => {
        if (this.down && !this.down.moved && this.pointers.size === 1) {
          this.down.mode = 'precise';
          navigator.vibrate?.(15);
          this.preciseEv = this.makeEvent(e, true, ToolManager.PRECISE_OFFSET);
          this.lastSnap = this.preciseEv.snap;
          this.active?.move(this.preciseEv);
          this.view.invalidateOverlay();
        }
      }, 300);
    }
    if (e.pointerType === 'touch' && this.active?.id === 'select') {
      this.longPressArmed = false;
      this.longPressTimer = setTimeout(() => {
        if (this.down && !this.down.moved) {
          // Touch safety: a grip/window drag starts only after a deliberate
          // long press. A normal tap must never move a CAD grip accidentally.
          this.longPressArmed = true;
          navigator.vibrate?.(20);
          this.down.mode = 'drag';
          this.active?.down(this.down.ev);
        }
      }, 450);
    } else {
      this.active?.down(ev);
    }
  };

  private onMove = (e: PointerEvent) => {
    this.lastPointerType = e.pointerType;
    const prev = this.pointers.get(e.pointerId);
    if (prev) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    // pinch / two-finger pan (mode=2) — DWG McScaleGestureDetector with MinSpan/SpanSlop
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = this.el.getBoundingClientRect();
      // Slop gate: ignore jitter until span change exceeds SpanSlop and absolute span >= MinSpan
      if (!this.pinch.active) {
        if (d < DWG_PINCH_MIN_SPAN_PX || Math.abs(d - this.pinch.startD) < DWG_PINCH_SPAN_SLOP_PX) {
          this.pinch = { d, cx, cy, startD: this.pinch.startD, active: false };
          return;
        }
        this.pinch.active = true;
      }
      // No fling inertia: direct 1:1 panPixels + zoomAt (DWG onFling returns false)
      this.view.cam.panPixels(cx - this.pinch.cx, cy - this.pinch.cy);
      if (this.pinch.d > 0 && d > 0) this.view.cam.zoomAt(cx - r.left, cy - r.top, d / this.pinch.d);
      this.pinch = { d, cx, cy, startD: this.pinch.startD, active: true };
      this.view.viewChanged();
      return;
    }
    // After a pinch, ignore the remaining finger until all contacts are up.
    // This prevents the final finger-up (or its movement) from being delivered
    // as a CAD point at the zoom/pan location.
    if (this.gestureBlocked) return;
    if (this.down?.mode === 'precise') {
      const pe = this.makeEvent(e, true, ToolManager.PRECISE_OFFSET);
      this.preciseEv = pe; this.lastEvent = pe; this.lastSnap = pe.snap;
      this.onCursor?.(pe.p);
      this.active?.move(pe);
      this.view.invalidateOverlay();
      return;
    }
    const ev = this.makeEvent(e, !this.down || this.down.mode === 'none' || this.down.mode === 'drag');
    this.lastEvent = ev;
    this.lastSnap = ev.snap;
    this.onCursor?.(ev.p);
    const dn = this.down;
    if (dn && prev) {
      // ---- DWG MyCADView ACTION_MOVE decision (touch only) ----
      // Mouse keeps simple 3px slop for precision; touch uses DWG velocity model.
      if (e.pointerType === 'touch') {
        const dt = Math.max(1, performance.now() - this.dwgCurrentTime);
        const dist = Math.hypot(e.clientX - this.dwgStartX, e.clientY - this.dwgStartY);
        const velocity = dist / dt; // px/ms
        if (this.dwgControl === 0 && dist > DWG_FLICKER_DIST_PX) {
          // Flicker suppression: tiny movement in <200ms is jitter, not a gesture
          if (dist < DWG_FLICKER_DIST_PX + 1 && dt < DWG_FLICKER_TIME_MS) {
            this.isReturnFromMove = true;
            return;
          }
          // Velocity gate: fast OR late movement => pan (DWG TOUCH2DOWN), slow => tool
          const isFastPan = dt <= DWG_FLICKER_TIME_MS || velocity >= DWG_VELOCITY_PX_PER_MS || this.bFullScreen;
          if (isFastPan) {
            this.hh = true; // DWG hh flag: second-finger style drag
          } else {
            this.hh = false;
          }
          this.dwgControl++;
          this.isReturnFromMove = false;
          // Defer tool delivery until decision is made (DWG defers OM_TOUCH_DOWN)
        }
        if (this.dwgControl === 0 && dist <= DWG_FLICKER_DIST_PX + 1) {
          // still within jitter, don't trigger pan or tool yet
          this.isPointSelected = false;
          return;
        }
        this.isPointSelected = true;
        // Block accidental pan while a command runs (IsCanSingleMove === false)
        const canMove = this.isCanSingleMove();
        const toolWantsDrag = !!(this.active?.wantsDrag);
        if (!dn.moved && dist > TOUCH_SLOP_PX) {
          dn.moved = true;
          clearTimeout(this.longPressTimer);
          // DWG: if cannot single-move, single finger feeds the tool, not the camera
          // In Edit mode, a single-finger drag in Select is a window/grip
          // gesture, not a map pan. View mode explicitly enables one-finger pan.
          const panAllowed = canMove && (this.isSingleMove || this.bFullScreen || this.active?.id === 'pan' || this.active?.id === 'zoom');
          const toolDrag = this.active && (toolWantsDrag || this.longPressArmed || (!panAllowed && (this.active.id !== 'select' || !this.isSingleMove)));
          if (dn.mode === 'none') {
            dn.mode = toolDrag ? 'drag' : 'pan';
            if (dn.mode === 'pan') this.lastSnap = null;
          }
        }
      } else {
        // Mouse / pen: simple slop, immediate drag for left button
        const dist = Math.hypot(e.clientX - dn.x, e.clientY - dn.y);
        const thresh = MOUSE_SLOP_PX;
        if (!dn.moved && dist > thresh) {
          dn.moved = true;
          clearTimeout(this.longPressTimer);
          if (dn.mode === 'none') {
            const toolDrag = this.active && (this.active.wantsDrag || (e.pointerType !== 'touch' && dn.button === 0) || this.longPressArmed);
            dn.mode = toolDrag ? 'drag' : 'pan';
            if (dn.mode === 'pan') this.lastSnap = null;
          }
        }
      }
      if (dn.moved) {
        if (dn.mode === 'pan') {
          this.view.cam.panPixels(e.clientX - prev.x, e.clientY - prev.y);
          this.view.viewChanged();
          return;
        }
        if (dn.mode === 'drag') { this.active?.drag(ev, dn.ev); this.view.invalidateOverlay(); return; }
      }
    }
    if (!this.view.layout) this.active?.move(ev);
    this.view.invalidateOverlay();
  };

  private onUp = (e: PointerEvent) => {
    clearTimeout(this.longPressTimer);
    this.pointers.delete(e.pointerId);
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (this.gestureBlocked) {
      if (this.pointers.size === 0) {
        this.pinch = null;
        this.down = null;
        this.gestureBlocked = false;
        this.preciseEv = null;
        this.lastSnap = null;
        this.dwgMode = 0;
        this.isTwos = false;
        this.isPointSelected = false;
        this.lastCompleteTime = performance.now();
        this.view.invalidateOverlay();
      }
      return;
    }
    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
      }
      if (this.pointers.size === 0) {
        this.down = null;
        this.gestureBlocked = false;
        this.preciseEv = null;
        this.lastSnap = null;
        this.dwgMode = 0;
        this.lastCompleteTime = performance.now();
      }
      return;
    }
    const dn = this.down;
    this.down = null;
    if (!dn) return;
    if (dn.mode === 'precise') {
      const pe = this.makeEvent(e, true, ToolManager.PRECISE_OFFSET);
      this.preciseEv = null;
      this.active?.click(pe);
      this.view.invalidateOverlay();
      return;
    }
    const ev = this.makeEvent(e, dn.mode !== 'pan');
    if (dn.mode === 'pan') {
      // DWG ACTION_UP after pan: never synthesize a tap (isPointSelected or moved)
      if (!dn.moved && dn.button === 2) this.active?.enter();
      this.dwgMode = 0;
      this.isPointSelected = false;
      this.isReturnFromMove = false;
      this.lastCompleteTime = performance.now();
      return;
    }
    if (dn.mode === 'drag' && dn.moved) {
      this.active?.dragEnd(ev, dn.ev);
      this.longPressArmed = false;
      this.dwgMode = 0;
      this.isPointSelected = false;
      this.isReturnFromMove = false;
      this.lastCompleteTime = performance.now();
      this.view.invalidateOverlay();
      return;
    }
    this.longPressArmed = false;
    this.active?.up(ev);
    // DWG ACTION_UP: if never moved (isfirstDown && !isPointSelected) synthesize DOWN+UP tap at anchor.
    // If isReturnFromMove (flicker suppressed), also synthesize a tap at the anchor point.
    const movedDist = Math.hypot(e.clientX - dn.x, e.clientY - dn.y);
    const tapThresh = e.pointerType === 'touch' ? TOUCH_SLOP_PX : MOUSE_SLOP_PX;
    if (e.pointerType === 'touch') {
      if (this.isReturnFromMove) {
        // jitter-only finger: DWG sends DOWN+UP at start point, not at release point
        const anchorEv = this.makeEvent(e, true);
        this.active?.click(anchorEv);
        if (anchorEv.snap) {
          this.snapFeedback = true;
          clearTimeout(this.snapFeedbackTimer);
          this.view.invalidateOverlay();
          this.snapFeedbackTimer = setTimeout(() => {
            this.snapFeedback = false;
            this.view.invalidateOverlay();
          }, 450);
        }
      } else if (!dn.moved) {
        if (movedDist > tapThresh) { this.view.invalidateOverlay(); this.dwgMode = 0; this.lastCompleteTime = performance.now(); return; }
        // A normal touch tap is a valid command point too. makeEvent() has
        // already resolved endpoint/midpoint/node/nearest snaps for the active tool.
        this.active?.click(ev);
        if (ev.snap) {
          this.snapFeedback = true;
          clearTimeout(this.snapFeedbackTimer);
          this.view.invalidateOverlay();
          this.snapFeedbackTimer = setTimeout(() => {
            this.snapFeedback = false;
            this.view.invalidateOverlay();
          }, 450);
        }
      } else if (!this.isPointSelected) {
        // moved but isPointSelected stayed false => long-press hold, not a tap
        this.view.invalidateOverlay();
      }
    } else {
      if (!dn.moved) {
        if (movedDist > tapThresh) { this.view.invalidateOverlay(); this.dwgMode = 0; this.lastCompleteTime = performance.now(); return; }
        this.active?.click(ev);
      }
    }
    this.dwgMode = 0;
    this.isPointSelected = false;
    this.isReturnFromMove = false;
    this.lastCompleteTime = performance.now();
    this.view.invalidateOverlay();
  };

  private onCancel = (e: PointerEvent) => {
    clearTimeout(this.longPressTimer);
    this.pointers.delete(e.pointerId);
    this.pointers.clear();
    this.pinch = null;
    this.down = null;
    this.preciseEv = null;
    this.gestureBlocked = false;
    this.lastSnap = null;
    // DWG GestureHandler ACTION_CANCEL (3): endGesture + reset mode, never tap
    this.dwgMode = 0;
    this.isTwos = false;
    this.isPointSelected = false;
    this.isReturnFromMove = false;
    this.hh = false;
    this.lastCompleteTime = performance.now();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    const factor = Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1));
    this.view.cam.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    this.view.viewChanged();
  };

  private onDblClick = (e: MouseEvent) => {
    if (e.button === 1) this.view.fitExtents();
  };

  /** keyboard handling; returns true if consumed */
  keyHandlers: ((e: KeyboardEvent) => boolean)[] = [];
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (this.active?.key(e)) { e.preventDefault(); return; }
    if (e.key === 'Escape') { this.active?.escape(); e.preventDefault(); return; }
    if (e.key === 'Enter' || (e.key === ' ' && this.active?.id !== 'select')) { this.active?.enter(); e.preventDefault(); return; }
    for (const h of this.keyHandlers) if (h(e)) { e.preventDefault(); return; }
  };

  /** forward typed command-line input to the active tool */
  input(text: string): boolean { return this.active?.input(text) ?? false; }

  /** DWG View/Edit mode helper: when true, single finger pans even during commands (like bFullScreen). */
  setViewOnly(v: boolean) { this.bFullScreen = v; this.isSingleMove = v; }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.active?.deactivate();
  }
}
