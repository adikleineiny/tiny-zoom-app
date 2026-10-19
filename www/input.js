// RC-transmitter style twin sticks + keyboard + JUMP / FIRE buttons.
// Left stick:  vertical = throttle (ground) / altitude (flyer).  Right stick: horizontal = steering / yaw, vertical = forward/back pitch (flyer).
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
  setType(t) {
    this.type = t;
    document.getElementById('lblL').textContent = t === 'car' ? 'Throttle / Brake' : 'Altitude ↑↓';
    document.getElementById('lblR').textContent = t === 'car' ? 'Steer ⟷' : 'Yaw ⟷ · Forward ↑↓';
    const lj = document.getElementById('lblJump'); if (lj) lj.textContent = t === 'car' ? 'JUMP' : 'HOP';
  }
  get throttleHeld() { const L = this.sticks.L, k = this.keys; return Math.abs(L.y) > 0.3 || k.has('KeyW') || k.has('ArrowUp') || k.has('KeyS') || k.has('ArrowDown'); }
  read(out) {
    this.watchdog();
    const k = this.keys, L = this.sticks.L, R = this.sticks.R; const dz = v => Math.abs(v) < 0.08 ? 0 : v;
    const kUp = k.has('KeyW') || k.has('ArrowUp'), kDn = k.has('KeyS') || k.has('ArrowDown');
    const kL = k.has('KeyA') || k.has('ArrowLeft'), kR = k.has('KeyD') || k.has('ArrowRight');
    const kRise = k.has('Space') || k.has('KeyE'), kSink = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyQ');
    const kb = (a, b) => (a ? 1 : 0) - (b ? 1 : 0);
    if (this.type === 'car') {
      out.thr = clamp1(dz(L.y) + kb(kUp, kDn)); out.steer = clamp1(dz(R.x) + kb(kR, kL)); out.alt = 0; out.pitch = 0;
      out.jump = this.jumpHeld || k.has('Space');
    } else {
      out.alt = clamp1(dz(L.y) + kb(kRise, kSink)); out.steer = clamp1(dz(R.x) + kb(kR, kL)); out.pitch = clamp1(dz(R.y) + kb(kUp, kDn)); out.thr = 0;
      out.jump = this.jumpHeld;
    }
    if (this.fireQueued) { out.fire = true; this.fireQueued = false; }
    this.renderSticks();
    return out;
  }
  renderSticks() {
    const L = this.sticks.L, R = this.sticks.R; if (!this.elL) return;
    const kx = this.type === 'car' ? 0 : L.x;
    this.elL.style.setProperty('--kx', (kx * 32) + 'px'); this.elL.style.setProperty('--ky', (-L.y * 32) + 'px');
    this.elR.style.setProperty('--kx', (R.x * 32) + 'px'); this.elR.style.setProperty('--ky', (this.type === 'car' ? 0 : -R.y * 32) + 'px');
    this.elL.classList.toggle('held', L.id !== null); this.elR.classList.toggle('held', R.id !== null);
  }
}
const clamp1 = v => v < -1 ? -1 : v > 1 ? 1 : v;
