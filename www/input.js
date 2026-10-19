// RC-transmitter style twin sticks + keyboard + JUMP / FIRE buttons.
// v3.4: fully analog 360° sticks. Default 'One stick' mode: left stick x = steer/yaw, y = throttle/forward (diagonals blend);
// right stick does the same (flyers hold altitude automatically). 'Point & go' and 'Classic RC' modes in Controls.
//
// Touch robustness (iOS Safari): touches are tracked by Touch.identifier with Touch Events (pointer events only for
// mouse / pen, or touch on browsers without Touch Events). Every touchstart / touchend / touchcancel re-checks the full
// e.touches list and releases any stick or button whose finger is gone, so a lost "end" event can never leave a stick
// pushed. A stale stick slot is reclaimed by a new finger, sticks are released when the finger slides off-screen or onto
// FIRE / JUMP / pause / reset, everything is released on blur / visibilitychange / pagehide / orientationchange /
// pause, and a watchdog zeroes a stick that gets no events and is not in the last known active touch list.
const WATCHDOG_MS = 300;
export class Input {
  constructor() {
    this.keys = new Set(); this.sticks = { L: this.newStick(), R: this.newStick() };
    this.type = 'car'; this.maxR = 55; this.jumpHeld = false; this.fireQueued = false;
    this.useTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (typeof TouchEvent !== 'undefined' && navigator.maxTouchPoints > 0));
    this.active = new Set();      // identifiers of fingers currently on screen (from the last e.touches)
    this.lastTouchEvt = 0;
    this.dead = new Set();        // fingers that slid onto a button: ignored until lifted
    this.btns = {}; this.ptrActive = new Set();               // id -> { el, ids:Set, on, off }
    this.stats = { released: 0, watchdog: 0, reclaimed: 0, reconciled: 0 };
    addEventListener('keydown', e => {
      this.keys.add(e.code); if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyF' && !e.repeat) this.fireQueued = true;
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    const resetAll = () => this.releaseAll();
    addEventListener('blur', resetAll); addEventListener('pagehide', resetAll); addEventListener('orientationchange', resetAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetAll(); });
    screen.orientation?.addEventListener?.('change', resetAll);
    // iOS gestures / callouts / selection off
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, e => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', e => { if (this.inGame() || e.target.closest?.('#hud')) e.preventDefault(); });
    document.addEventListener('selectstart', e => { if (this.inGame()) e.preventDefault(); });
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
    this.elL = document.getElementById('stickL'); this.elR = document.getElementById('stickR');
    this.layer = document.getElementById('touchLayer');
    // action buttons (sit above the touch layer, between the two stick zones)
    const btn = (id, on, off) => { const el = document.getElementById(id); if (el) this.btns[id] = { el, ids: new Set(), on, off }; };
    btn('btnJump', () => { this.jumpHeld = true; }, () => { this.jumpHeld = false; });
    btn('wslot', () => { this.fireQueued = true; }); // v3.2: the weapon slot is the FIRE button
    if (this.useTouch) this.bindTouch();
    this.bindPointer();
  }
  newStick() { return { x: 0, y: 0, id: null, ox: 0, oy: 0, t: 0 }; }
  inGame() { return this.layer && !this.layer.classList.contains('hidden'); }
  // ---------- shared ----------
  stickOf(id) { for (const k of ['L', 'R']) if (this.sticks[k].id === id) return this.sticks[k]; return null; }
  releaseStick(st) { if (st.id !== null) this.stats.released++; st.id = null; st.x = st.y = 0; }
  pressBtn(name, id) { const b = this.btns[name]; if (!b) return; const was = b.ids.size; b.ids.add(id); b.el.classList.add('down'); if (!was || name === 'wslot') b.on(); }
  releaseBtnId(id) {
    for (const b of Object.values(this.btns)) if (b.ids.delete(id) && !b.ids.size) { b.el.classList.remove('down'); b.off && b.off(); }
  }
  releaseId(id) { const st = this.stickOf(id); if (st) this.releaseStick(st); this.releaseBtnId(id); this.dead.delete(id); }
  releaseAll() {
    for (const k of ['L', 'R']) this.releaseStick(this.sticks[k]);
    for (const b of Object.values(this.btns)) { if (b.ids.size) { b.ids.clear(); b.el.classList.remove('down'); b.off && b.off(); } }
    this.jumpHeld = false; this.active.clear(); this.dead.clear(); this.keys.clear();
    this.renderSticks();
  }
  // which on-screen control is under a point: 'wslot' (fire) | 'btnJump' | 'hbtn' | null
  controlAt(x, y) {
    for (const [name, b] of Object.entries(this.btns)) { const r = b.el.getBoundingClientRect(); if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return name; }
    for (const el of document.querySelectorAll('#hud .hbtn')) { const r = el.getBoundingClientRect(); if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return 'hbtn'; }
    return null;
  }
  startStick(id, x, y) {
    const st = this.sticks[x < innerWidth / 2 ? 'L' : 'R'];
    if (st.id !== null && st.id !== id) {
      // slot still held by a finger that is not on the screen any more (lost end event) → reclaim it
      if (!this.alive(st.id)) { this.stats.reclaimed++; this.releaseStick(st); }
      else return false;
    }
    st.id = id; st.ox = x; st.oy = y; st.x = st.y = 0; st.t = performance.now(); this.used = true; return true;
  }
  moveStick(st, x, y) {
    st.t = performance.now();
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { this.dead.add(st.id); this.releaseStick(st); return; } // slid off-screen
    const c = this.controlAt(x, y); if (c) { this.dead.add(st.id); this.releaseStick(st); return; } // slid onto FIRE / JUMP / pause / reset
    let dx = (x - st.ox) / this.maxR, dy = -(y - st.oy) / this.maxR; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    st.x = dx; st.y = dy;
  }
  // touch identifiers are numbers, pointer ids are namespaced strings ('p<pointerId>')
  alive(id) { return typeof id === 'string' ? this.ptrActive.has(id) : this.active.has(id); }
  // ---------- Touch Events (iOS Safari path) ----------
  bindTouch() {
    const opt = { passive: false, capture: true };
    const syncActive = e => { this.active = new Set(Array.from(e.touches, t => t.identifier)); this.lastTouchEvt = performance.now(); };
    const reconcile = () => { // release everything whose finger is no longer on screen
      for (const k of ['L', 'R']) { const st = this.sticks[k]; if (st.id !== null && !this.active.has(st.id)) { this.stats.reconciled++; this.releaseStick(st); } }
      for (const b of Object.values(this.btns)) for (const id of [...b.ids]) if (!this.active.has(id)) this.releaseBtnId(id);
      for (const id of [...this.dead]) if (!this.active.has(id)) this.dead.delete(id);
    };
    document.addEventListener('touchstart', e => {
      syncActive(e); reconcile();
      const game = this.inGame();
      for (const t of e.changedTouches) {
        const id = t.identifier, tgt = t.target && t.target.closest ? t.target : null;
        if (tgt && tgt.closest('#hud .hbtn')) continue;                        // pause / reset: native click
        const bt = tgt && tgt.closest('.abtn, #wslot');
        if (bt && this.btns[bt.id]) { this.releaseId(id); this.pressBtn(bt.id, id); e.preventDefault(); continue; }
        if (!game) continue;
        if (tgt && !(tgt === this.layer || tgt.closest('#hud') || tgt.id === 'c')) continue;
        const c = this.controlAt(t.clientX, t.clientY);
        if (c === 'hbtn') continue; if (c) { this.pressBtn(c, id); e.preventDefault(); continue; }
        this.startStick(id, t.clientX, t.clientY); e.preventDefault();
      }
    }, opt);
    document.addEventListener('touchmove', e => {
      syncActive(e);
      for (const t of e.changedTouches) { const st = this.stickOf(t.identifier); if (st) this.moveStick(st, t.clientX, t.clientY); }
      if ((this.inGame() && !e.target?.closest?.('.overlay')) || e.target?.closest?.('#hud')) e.preventDefault(); // no scroll / zoom / rubber-band
    }, opt);
    const end = e => {
      syncActive(e);
      for (const t of e.changedTouches) { this.active.delete(t.identifier); this.releaseId(t.identifier); }
      reconcile();
      if (e.touches.length === 0) { for (const k of ['L', 'R']) this.releaseStick(this.sticks[k]); for (const b of Object.values(this.btns)) for (const id of [...b.ids]) this.releaseBtnId(id); this.dead.clear(); }
      const tg = e.target; if (this.inGame() && e.cancelable && (tg === this.layer || tg?.closest?.('.abtn, #wslot'))) e.preventDefault(); // no synthetic clicks / double-tap zoom
    };
    document.addEventListener('touchend', end, opt); document.addEventListener('touchcancel', end, opt);
  }
  // ---------- Pointer Events (mouse / pen; touch only where Touch Events are missing) ----------
  bindPointer() {
    const mine = e => !(this.useTouch && e.pointerType === 'touch');
    const layer = this.layer;
    layer.addEventListener('pointerdown', e => {
      if (!mine(e)) return; const pid = 'p' + e.pointerId; this.ptrActive.add(pid);
      if (this.controlAt(e.clientX, e.clientY)) return;
      if (this.startStick(pid, e.clientX, e.clientY)) { try { layer.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
    });
    const move = e => { if (!mine(e)) return; const st = this.stickOf('p' + e.pointerId); if (st) { this.moveStick(st, e.clientX, e.clientY); e.preventDefault(); } };
    const up = e => { if (!mine(e)) return; const pid = 'p' + e.pointerId; this.ptrActive.delete(pid); this.releaseId(pid); };
    layer.addEventListener('pointermove', move);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(t, up);
    addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    for (const [name, b] of Object.entries(this.btns)) {
      const el = b.el;
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (!mine(e)) return; const pid = 'p' + e.pointerId; this.ptrActive.add(pid); this.releaseId(pid); this.pressBtn(name, pid); try { el.setPointerCapture(e.pointerId); } catch (_) {} });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, e => { if (mine(e)) { const pid = 'p' + e.pointerId; this.ptrActive.delete(pid); this.releaseBtnId(pid); } });
      el.addEventListener('contextmenu', e => e.preventDefault());
    }
  }
  // watchdog: a stick whose finger is not in the active list and that got no events for a while is zeroed
  watchdog() {
    const now = performance.now();
    for (const k of ['L', 'R']) {
      const st = this.sticks[k]; if (st.id === null) continue;
      if (!this.alive(st.id) && now - st.t > WATCHDOG_MS) { this.stats.watchdog++; this.releaseStick(st); }
      if (!this.inGame() && now - st.t > WATCHDOG_MS) this.releaseStick(st);
    }
  }
  // v3.4 control modes: 'stick' = one analog stick drives (default), 'point' = point where you want to go, 'classic' = RC transmitter
  static MODES = { stick: 'One stick', point: 'Point & go', classic: 'Classic RC' };
  get mode() { if (!this._mode) { let m = null; try { m = localStorage.getItem('tz.controls'); } catch (_) {} this._mode = Input.MODES[m] ? m : 'stick'; } return this._mode; }
  set mode(m) { this._mode = Input.MODES[m] ? m : 'stick'; try { localStorage.setItem('tz.controls', this._mode); } catch (_) {} this.setType(this.type); }
  cycleMode() { const k = Object.keys(Input.MODES); this.mode = k[(k.indexOf(this.mode) + 1) % k.length]; return this.mode; }
  setType(t) {
    this.type = t; const m = this.mode, car = t === 'car';
    const L = m === 'classic' ? (car ? 'Throttle / Brake' : 'Altitude ↑↓') : m === 'point' ? (car ? 'Drive: point where to go' : 'Fly: point where to go') : (car ? 'Drive ✥ (steer + gas)' : 'Fly ✥ (yaw + forward)');
    const R = m === 'classic' ? (car ? 'Steer ⟷' : 'Yaw ⟷ · Forward ↑↓') : (car ? 'Steer ⟷ · Gas ↑↓' : (m === 'point' ? 'Yaw ⟷ · Altitude ↑↓' : 'Yaw ⟷ · Forward ↑↓'));
    const el = id => document.getElementById(id);
    if (el('lblL')) el('lblL').textContent = L; if (el('lblR')) el('lblR').textContent = R;
    const lj = el('lblJump'); if (lj) lj.textContent = car ? 'JUMP' : 'HOP';
    for (const b of document.querySelectorAll('.btnControls')) b.textContent = '🎮 Controls: ' + Input.MODES[m];
  }
  get throttleHeld() { const L = this.sticks.L, R = this.sticks.R, k = this.keys; return Math.hypot(L.x, L.y) > 0.3 || Math.abs(R.y) > 0.3 || k.has('KeyW') || k.has('ArrowUp') || k.has('KeyS') || k.has('ArrowDown'); }
  // radial deadzone (9%) rescaled to 0..1, plus a gentle response curve (fine control near centre, full lock at the edge)
  static shape(x, y, dz = 0.09) {
    const m = Math.hypot(x, y); if (m <= dz) return [0, 0];
    let a = Math.min(1, (m - dz) / (1 - dz)); a = 0.55 * a + 0.45 * a * a;
    return [x / m * a, y / m * a];
  }
  // ctx (optional): { cam, heading } in radians → used by 'point' mode
  read(out, ctx) {
    this.watchdog();
    const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - (this._lt || now)) / 1000)); this._lt = now;
    const k = this.keys, mode = this.mode, car = this.type === 'car';
    const [lx, ly] = Input.shape(this.sticks.L.x, this.sticks.L.y), [rx, ry] = Input.shape(this.sticks.R.x, this.sticks.R.y);
    const kUp = k.has('KeyW') || k.has('ArrowUp'), kDn = k.has('KeyS') || k.has('ArrowDown');
    const kL = k.has('KeyA') || k.has('ArrowLeft'), kR = k.has('KeyD') || k.has('ArrowRight');
    const kRise = k.has('Space') || k.has('KeyE'), kSink = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyQ');
    const kb = (a, b) => (a ? 1 : 0) - (b ? 1 : 0);
    // keyboard: every key combination is independent (W+A = gas + left); digital steer ramps in quickly instead of snapping
    const ks = this._ks = this._ks || { steer: 0 }; const kt = kb(kR, kL);
    ks.steer = kt === 0 ? 0 : (Math.sign(kt) !== Math.sign(ks.steer) ? 0.35 * kt : clamp1(ks.steer + kt * 7 * dt));
    let steer, fwd, alt = 0;
    if (mode === 'classic') { // original transmitter layout
      if (car) { fwd = ly; steer = rx; } else { alt = ly; steer = rx; fwd = ry; }
    } else if (mode === 'point' && ctx && (lx || ly)) { // left stick = direction to go (relative to the camera); push = how fast
      const mag = Math.min(1, Math.hypot(lx, ly)), target = (ctx.cam ?? ctx.heading ?? 0) + Math.atan2(lx, ly);
      let err = target - (ctx.heading ?? 0); err = Math.atan2(Math.sin(err), Math.cos(err));
      steer = clamp1(err * 2.2) + rx; fwd = mag * (Math.abs(err) > 2.0 ? 0.6 : 1) + (car ? ry : 0);
      if (!car) alt = ry;
    } else { // 'stick': one stick does both – a diagonal push steers and throttles at the same time; right stick helps
      steer = lx + rx;
      fwd = ly + ry; // flyers: auto altitude hold does the height (Classic RC for manual altitude)
    }
    // tiny low-pass on touch input: no jitter, still instant (~35 ms)
    const sm = this._sm = this._sm || { steer: 0, fwd: 0, alt: 0 }, a = dt > 0 ? 1 - Math.exp(-dt / 0.035) : 1;
    sm.steer += (clamp1(steer) - sm.steer) * a; sm.fwd += (clamp1(fwd) - sm.fwd) * a; sm.alt += (clamp1(alt) - sm.alt) * a;
    for (const q of ['steer', 'fwd', 'alt']) if (Math.abs(sm[q]) < 1e-3) sm[q] = 0;
    if (car) {
      out.thr = clamp1(sm.fwd + kb(kUp, kDn)); out.steer = clamp1(sm.steer + ks.steer); out.alt = 0; out.pitch = 0;
      out.jump = this.jumpHeld || k.has('Space');
    } else {
      out.alt = clamp1(sm.alt + kb(kRise, kSink)); out.steer = clamp1(sm.steer + ks.steer); out.pitch = clamp1(sm.fwd + kb(kUp, kDn)); out.thr = 0;
      out.jump = this.jumpHeld;
    }
    if (this.fireQueued) { out.fire = true; this.fireQueued = false; }
    this.renderSticks();
    return out;
  }
  renderSticks() {
    const L = this.sticks.L, R = this.sticks.R; if (!this.elL) return;
    const classic = this.mode === 'classic', car = this.type === 'car';
    const kx = classic && car ? 0 : L.x;
    this.elL.style.setProperty('--kx', (kx * 32) + 'px'); this.elL.style.setProperty('--ky', (-L.y * 32) + 'px');
    this.elR.style.setProperty('--kx', (R.x * 32) + 'px'); this.elR.style.setProperty('--ky', (classic && car ? 0 : -R.y * 32) + 'px');
    this.elL.classList.toggle('held', L.id !== null); this.elR.classList.toggle('held', R.id !== null);
  }
}
const clamp1 = v => v < -1 ? -1 : v > 1 ? 1 : v;
