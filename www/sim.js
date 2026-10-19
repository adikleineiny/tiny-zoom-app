import { CONFIG } from './config.js';
import { wrapA } from './track.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// Merged per-racer stats (vehicles[class] + models[model] overrides)
export function vehicleStats(r) { return { ...CONFIG.vehicles[r.type], ...(CONFIG.models[r.model] || {}) }; }
export const modelClass = m => CONFIG.models[m]?.class || (m === 'drone' ? 'drone' : 'car');
export const normModel = m => CONFIG.models[m] ? m : (m === 'drone' ? 'drone' : 'racecar');

export class Racer {
  constructor(o) {
    Object.assign(this, {
      id: 0, name: '', type: 'car', color: 0xff0000, isPlayer: false,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, spool: 0,
      idx: 0, s: 0, lat: 0, progress: 0, lapsDone: 0, lapStart: 0, lapTimes: [], best: Infinity,
      finished: false, finishTime: 0, input: { thr: 0, steer: 0, alt: 0, pitch: 0 }, ai: null,
      onPad: false, padCD: 0, padHits: 0, wrongWayT: 0, surface: 'tile', section: 1, gateBlockT: 0, scrapeT: 0,
      model: null, grounded: true, groundY: 0, jumpCD: 0, airT: 0, landImpact: 0, drifting: false,
      spinT: 0, spinDir: 1, tumbleT: 0, tumbleTot: 1, stunT: 0, immuneT: 0, turboT: 0, fireT: 0,
      weapon: null, rollT: 0, holdT: 0, bomb: null, hits: 0, shots: 0,
      rescueT: 0, rescues: 0, stillT: 0, tryStillT: 0, noProgT: 0, _embT: 0, _bestProg: -1e9, stuckMaxT: 0,
    }, o);
    this.input = { thr: 0, steer: 0, alt: 0, pitch: 0, jump: false, fire: false, ...(o.input || {}) };
    this.model = normModel(this.model || this.type); this.type = modelClass(this.model);
    this.V = vehicleStats(this);
  }
  get controllable() { return this.spinT <= 0 && this.tumbleT <= 0; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { return this.vx * Math.cos(this.heading) + this.vz * Math.sin(this.heading); }
}

export class AIDriver {
  constructor(track, o = {}) { this.T = track; this.skill = o.skill ?? 1; this.lineK = o.lineK ?? 1; this.altOff = o.altOff ?? 0; this.stuckT = 0; this.recoverT = 0; }
  update(r, dt, running) {
    const T = this.T, N = T.N, ds = T.ds, A = CONFIG.ai, inp = r.input;
    if (!running) { inp.thr = inp.steer = inp.alt = inp.pitch = 0; return; }
    const sp = r.speed, fwd = r.fwd;
    const look = A.lookahead + sp * A.lookaheadSpeedK;
    const ti = (r.idx + Math.round(look / ds)) % N;
    const line = r.type === 'car' ? T.carLine : T.droneLine, heli = r.model === 'heli';
    let tx = T.px[ti] + T.nx[ti] * line[ti] * this.lineK, tz = T.pz[ti] + T.nz[ti] * line[ti] * this.lineK;
    const prof = r.type === 'car' ? T.carSpeed : heli ? T.heliSpeed : T.droneSpeed;
    let vt = prof[(r.idx + Math.round((8 + sp * 0.25) / ds)) % N] * this.skill;
    let targetAlt = Math.min(A.cruiseAltitude + this.altOff + T.gndAhead[r.idx], T.droneSafeAlt[r.idx]);
    // turbo pads: steer onto the next pad when it's close ahead (every vehicle type, same rule)
    for (const p of T.pads) { const ah = T.wrapS(p.s - r.s); if (ah > -10 && ah < 90) { const w = Math.max(0, 1 - ah / 70); tx = tx * (1 - w) + p.x * w; tz = tz * (1 - w) + p.z * w; targetAlt = Math.min(targetAlt, p.y + CONFIG.turboPads.flyHeight); break; } }
    let desired = Math.atan2(tz - r.z, tx - r.x);
    if (r.type === 'drone' && sp > 15) { const va = Math.atan2(r.vz, r.vx); desired += clamp(wrapA(desired - va), -0.6, 0.6) * 0.6; }
    const err = wrapA(desired - r.heading);
    // stuck detection
    if (sp < 5 && r.y < 40) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.0 && !(r.type === 'drone' && r.y - (r.groundY || 0) < 3 && r.spool < 1)) { this.recoverT = 0.9; this.stuckT = 0; }
    if (sp < 5 && running) this.stuckLong = (this.stuckLong || 0) + dt; else this.stuckLong = 0;
    if (this.stuckLong > 4.5) { this.stuckLong = 0; r.respawnReq = true; }
    // no forward progress for a while (wedged / knocked somewhere silly) → back on track
    if (running) { if (r.progress > (this.bestProg ?? -1e9) + 15) { this.bestProg = r.progress; this.noProgT = 0; } else if ((this.noProgT = (this.noProgT || 0) + dt) > 6) { this.noProgT = 0; this.bestProg = r.progress; r.respawnReq = true; } }
    inp.jump = false;
    if (r.type === 'car') {
      const sfx = r.surface === 'grass' && r.V.grass ? r.V.grass : CONFIG.surfaces[r.surface].car;
      vt = Math.min(vt, r.V.topSpeed * sfx.speed * this.skill * (r.turboT > 0 ? 2 : 1));
      if (this.recoverT > 0) { this.recoverT -= dt; inp.thr = -1; inp.steer = -Math.sign(err) || 1; return; }
      // hop small obstacles ahead, plus the odd jump just for fun
      if (sp > 30 && r.grounded) {
        const c = Math.cos(r.heading), s = Math.sin(r.heading);
        for (const dist of [8 + sp * 0.12, 4 + sp * 0.08]) {
          const hx = r.x + c * dist, hz = r.z + s * dist;
          for (const o of T.minorSolids) if (o.y1 <= A.hopMaxHeight && hx > o.x0 - 5 && hx < o.x1 + 5 && hz > o.z0 - 5 && hz < o.z1 + 5) inp.jump = true;
        }
        if (Math.abs(err) < 0.25 && Math.random() < A.randomJumpRate * dt) inp.jump = true;
      }
      // facing the wrong way (e.g. after a spin-out): J-turn in reverse until roughly aligned (hysteresis avoids crawling backwards forever)
      if (Math.abs(err) > 2.3 && sp < 40) this.turnT = 2.5;
      if (this.turnT > 0) { this.turnT -= dt; if (Math.abs(err) < 0.9) this.turnT = 0; else { inp.thr = -1; inp.steer = -Math.sign(err) || 1; return; } }
      inp.steer = clamp(err * 2.4, -1, 1);
      let thr = fwd < vt - 2 ? 1 : fwd > vt + 6 ? -1 : 0.3;
      if (Math.abs(err) > 1.2) thr = Math.min(thr, 0.4);
      inp.thr = thr; inp.alt = 0; inp.pitch = 0;
    } else {
      inp.steer = clamp(err * 2.2, -1, 1);
      inp.alt = clamp((targetAlt - r.y) / 7 - r.vy / 50, -1, 1);
      if (r.stunT > 0) inp.alt = 1; // fight the power cut
      if (this.recoverT > 0) { this.recoverT -= dt; inp.pitch = -0.8; inp.alt = 0.6; return; }
      let pitch = fwd < vt - 2 ? 1 : fwd > vt + 5 ? -1 : 0.25;
      if (Math.abs(err) > 0.9) pitch *= 0.3;
      if (r.y - (r.groundY || 0) < r.V.takeoffAltitude + 1 && targetAlt - (r.groundY || 0) > 5) pitch = 0; // wait for lift-off
      if (heli && r.tiltP > 0.5 && fwd > vt + 2) pitch = -1; // heli: brake early, it carries momentum
      inp.pitch = pitch;
    }
  }
}

export class Sim {
  constructor(track) { this.T = track; this.racers = []; this.t = 0; this.running = false; this._pr = {}; this.finishOrder = []; this.events = []; this.weapons = null; }
  reset() { this.racers = []; this.t = 0; this.running = false; this.finishOrder = []; this.events.length = 0; if (this.weapons) this.weapons.reset(); }
  emit(e) { if (this.events.length < 400) this.events.push(e); }
  // Apply a weapon / ram hit. o: { kx, kz, up, spin, tumble, stun, slow, by, kind }
  hit(r, o) {
    const W = CONFIG.weapons.hit;
    if (r.immuneT > 0 || (r.finished && !r.isPlayer && false)) return false;
    const m = 1 / (r.V.mass || 1), slow = o.slow ?? 0.6;
    r.vx = r.vx * slow + (o.kx || 0) * m; r.vz = r.vz * slow + (o.kz || 0) * m;
    if (o.up) { r.vy = Math.max(r.vy, o.up * (r.type === 'drone' ? 0.6 : 1) * Math.sqrt(m)); r.grounded = false; r.floaty = false; }
    if (o.spin) { r.spinT = Math.max(r.spinT, o.spin); r.spinDir = Math.random() < 0.5 ? -1 : 1; }
    if (o.tumble) { r.tumbleT = r.tumbleTot = o.tumble; }
    if (o.stun) r.stunT = Math.max(r.stunT, o.stun);
    r.immuneT = W.immune; r.hits++; if (o.by && o.by !== r) o.by.landed = (o.by.landed || 0) + 1;
    this.emit({ type: 'hit', r, kind: o.kind, by: o.by });
    return true;
  }
  respawn(r) {
    const T = this.T, i = r.idx; r.x = T.px[i]; r.z = T.pz[i]; const g0 = T.groundAt(r.x, r.z); r.y = r.type === 'drone' ? Math.min(15 + g0, T.droneSafeAlt[i]) : g0; r._tg = g0;
    r.vx = r.vy = r.vz = 0; r.heading = Math.atan2(T.tz[i], T.tx[i]); r.lat = 0; r.grounded = true; r.groundY = g0; r.floaty = false;
    r.spinT = r.tumbleT = r.stunT = 0; r.immuneT = 1.5; r.respawnReq = false;
    this.emit({ type: 'respawn', r });
    this.resetMonitors(r);
  }
  // ---------- Lakitu-style rescue: lift + fade out, put back on the track a bit behind, facing forward, short boost ----------
  rescue(r, reason = 'stuck') {
    const RC = CONFIG.rescue; if (!RC?.enabled || r.rescueT > 0 || r.finished) return false;
    r.rescueT = RC.animTime; r.rescuePlaced = false; r.rescueReason = reason; r.rescueFrom = { x: r.x, y: r.y, z: r.z };
    r.immuneT = Math.max(r.immuneT, RC.animTime + RC.immune); r.rescues = (r.rescues || 0) + 1;
    r.vx = r.vy = r.vz = 0; r.input.jump = false;
    this.emit({ type: 'rescue', r, reason });
    return true;
  }
  rescueStep(r, dt) {
    const RC = CONFIG.rescue;
    r.vx = r.vy = r.vz = 0; r.rescueT -= dt;
    if (!r.rescuePlaced && r.rescueT <= RC.animTime * 0.5) this.placeRescue(r);
    if (r.rescueT <= 0) { // drop-in done: little forward boost
      r.rescueT = 0; if (!r.rescuePlaced) this.placeRescue(r);
      const v = RC.boost * (r.type === 'car' ? r.V.topSpeed : r.V.thrust / r.V.drag);
      r.vx = Math.cos(r.heading) * v; r.vz = Math.sin(r.heading) * v; r.immuneT = Math.max(r.immuneT, RC.immune);
      this.emit({ type: 'rescued', r });
    }
    r._px = r.x; r._pz = r.z; r._py = r.y; r._lat = r.lat;
  }
  // a track point is free for this racer (not inside / touching a prop at the height it will be put)
  rescueSpotFree(r, i, lat) {
    const T = this.T, x = T.px[i] + T.nx[i] * lat, z = T.pz[i] + T.nz[i] * lat, g = T.groundAt(x, z);
    const y = r.type === 'drone' ? Math.min(15 + g, T.droneSafeAlt[i]) : g;
    if (T.insideSolid(x, y + 1, z, r.V.radius + 1) || T.insideSolid(x, y + r.V.height, z, r.V.radius)) return null;
    if (r.type === 'car' && Math.abs(T.groundAt(x + T.tx[i] * 6, z + T.tz[i] * 6) - g) > 2.5) return null; // not on a ramp lip / step
    for (const o of this.racers) if (o !== r && Math.hypot(o.x - x, o.z - z) < o.V.radius + r.V.radius + 2 && Math.abs(o.y - y) < 10) return null;
    return { x, y, z, g };
  }
  placeRescue(r) {
    const T = this.T, RC = CONFIG.rescue, N = T.N;
    if (!(r.idx >= 0 && r.idx < N)) r.idx = 0;
    const repeat = r._lastRescueT !== undefined && this.t - r._lastRescueT < RC.repeatWindow && r.progress < r._lastRescueProg + RC.repeatProgress;
    r._rescueStreak = repeat ? (r._rescueStreak || 0) + 1 : 0;
    const gateCase = r.type === 'drone' && r.rescueReason === 'stuck' && r.gateBlockT > 0; // too high at a gate: fly lower – only skip after many tries
    const ahead = r._rescueStreak >= (gateCase ? 4 : 2);
    let i = (r.idx + Math.round((ahead ? RC.skipAhead : -RC.backDist) / T.ds) + N) % N, spot = null;
    for (let k = 0; k < 80 && !spot; k++) {
      for (const lat of [0, -9, 9, -16, 16]) { if (Math.abs(lat) > T.halfW[i] - r.V.halfWidth) continue; spot = this.rescueSpotFree(r, i, lat); if (spot) break; }
      if (!spot) i = (i + (ahead ? 1 : -1) + N) % N;
    }
    if (!spot) { const g = T.groundAt(T.px[i], T.pz[i]); spot = { x: T.px[i], z: T.pz[i], g, y: r.type === 'drone' ? Math.min(15 + g, T.droneSafeAlt[i]) : g }; }
    r.progress += T.wrapS(T.s[i] - r.s); r.idx = i; r.s = T.s[i];
    r.x = spot.x; r.z = spot.z; r.y = spot.y; r._tg = spot.g; r.groundY = spot.g; r.lat = T.project(r.x, r.z, i, this._pr).lat;
    r._px = r.x; r._pz = r.z; r._py = r.y; r._lat = r.lat;
    r.heading = Math.atan2(T.tz[i], T.tx[i]); r.vx = r.vy = r.vz = 0; r.grounded = true; r.floaty = false; r.airT = 0; r.tiltP = 0;
    r.spinT = r.tumbleT = r.stunT = 0; r.wrongWayT = 0; r.gateBlockT = 0; r.rescuePlaced = true;
    if (r.type === 'drone') r.spool = 1;
    r._lastRescueT = this.t; r._lastRescueProg = r.progress;
    this.resetMonitors(r);
    if (r.ai) { const a = r.ai; a.stuckT = a.recoverT = a.turnT = 0; a.stuckLong = 0; a.noProgT = 0; a.bestProg = r.progress; }
  }
  resetMonitors(r) { r._ax = r.x; r._ay = r.y; r._az = r.z; r.stillT = r.tryStillT = r.noProgT = r._embT = 0; r._bestProg = r.progress; r.stuckMaxT = 0; }
  // stuck / off-track detectors → rescue (runs for every racer every physics step)
  monitor(r, dt) {
    const RC = CONFIG.rescue, T = this.T; if (!RC?.enabled || !this.running || r.finished || r.rescueT > 0) return;
    if (r._ax === undefined) { this.resetMonitors(r); return; }
    if (!isFinite(r.x) || !isFinite(r.y) || !isFinite(r.z) || !isFinite(r.vx) || !isFinite(r.vz)) { r.x = T.px[r.idx] || 0; r.z = T.pz[r.idx] || 0; r.y = 0; r.vx = r.vy = r.vz = 0; return this.rescue(r, 'fell'); }
    const inp = r.input, car = r.type === 'car', hitState = r.spinT > 0 || r.tumbleT > 0 || r.stunT > 0;
    const tryW = hitState ? 0 : car ? (Math.abs(inp.thr) > 0.3 ? 1 : 0) : r.spool < 1 ? 0 : Math.abs(inp.pitch) > 0.3 ? 1 : inp.alt > 0.3 ? 0.5 : 0;
    if (Math.hypot(r.x - r._ax, r.z - r._az, (r.y - r._ay) * 0.6) > RC.moveDist) { r._ax = r.x; r._ay = r.y; r._az = r.z; r.stillT = 0; r.tryStillT = 0; }
    else { r.stillT += dt; r.tryStillT += dt * tryW; }
    if (r.progress > r._bestProg + RC.progressStep) { r._bestProg = r.progress; r.noProgT = 0; } else if (tryW > 0) r.noProgT += dt;
    if (r.scrapeT > 0) r._contactAt = this.t;
    const touching = this.t - (r._contactAt ?? -99) < 1;
    const g = T.groundAt(r.x, r.z);
    r._embT = (car && T.insideSolid(r.x, r.y + 1.5, r.z, -1)) ? r._embT + dt : 0;
    const lim = T.halfW[r.idx] + (r.type === 'drone' ? CONFIG.droneShortcutMargin * T.marginF[r.idx] : 0) + RC.offTrack;
    let why = null;
    if (r.y < g - RC.fallDepth || r.y > CONFIG.maxAltitude + g + 40) why = 'fell';
    else if (Math.abs(r.lat) > lim) why = 'offtrack';
    else if (r._embT > RC.embedTime) why = 'wedged';
    else if (r.tryStillT > RC.stuckTime) why = 'stuck';
    else if (r.stillT > RC.idleTime && touching) why = 'wedged';
    else if (r.noProgT > RC.noProgressTime) why = 'noprogress';
    else if (r.wrongWayT > RC.wrongWayTime) why = 'wrongway';
    r.stuckMaxT = Math.max(r.stuckMaxT || 0, r.tryStillT);
    if (why) this.rescue(r, why);
  }
  // seconds of "still while trying" so far (HUD hint)
  stuckLevel(r) { return r.rescueT > 0 ? 0 : (r.tryStillT || 0) / CONFIG.rescue.stuckTime; }
  add(r) { r.id = this.racers.length; this.racers.push(r); return r; }
  placeGrid(order) {
    const T = this.T; const slots = [[-22, -20], [-22, 20], [-52, -20], [-52, 20], [-82, 0]];
    order.forEach((r, k) => {
      const [s, lat] = slots[k % slots.length]; const i = ((Math.round(s / T.ds)) % T.N + T.N) % T.N;
      r.x = T.px[i] + T.nx[i] * lat; r.z = T.pz[i] + T.nz[i] * lat; r.y = 0; r.heading = Math.atan2(T.tz[i], T.tx[i]);
      r.vx = r.vy = r.vz = 0; const pr = T.project(r.x, r.z, null); r.idx = pr.idx; r.s = pr.s; r.lat = pr.lat; r.progress = T.wrapS(pr.s); r.rescueT = 0; r._lastRescueT = undefined; this.resetMonitors(r);
    });
  }
  step(dt) {
    const T = this.T;
    if (this.running) this.t += dt;
    for (const r of this.racers) {
      if (r.ai && (!r.isPlayer || r.autopilot || r.finished)) r.ai.update(r, dt, this.running);
      if (!this.running) { r.input.thr = r.input.steer = r.input.alt = r.input.pitch = 0; r.input.jump = false; }
      if (r.respawnReq) { r.respawnReq = false; if (this.running && CONFIG.rescue?.enabled) this.rescue(r, 'ai'); else this.respawn(r); }
      if (r.rescueT > 0) { this.rescueStep(r, dt); continue; }
      r._px = r.x; r._pz = r.z; r._py = r.y; r._lat = r.lat;
      for (const k of ['spinT', 'tumbleT', 'stunT', 'immuneT', 'turboT', 'jumpCD']) if (r[k] > 0) r[k] = Math.max(0, r[k] - dt);
      if (r.type === 'car') { this.carStep(r, dt); this.collideSolids(r); this.groundSupport(r, dt); }
      else { this.droneStep(r, dt); this.collideSolids(r); }
    }
    // vehicle-vehicle: mass-weighted bouncy contact, turbo rams, sticky-bomb passing
    const R = this.racers, Wt = CONFIG.weapons.turbo;
    for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
      const A = R[a], B = R[b]; if (A.rescueT > 0 || B.rescueT > 0) continue; // being rescued = ghost
      const dx = B.x - A.x, dz = B.z - A.z; const d = Math.hypot(dx, dz);
      const ra = A.V.radius, rb = B.V.radius;
      if (d < ra + rb && d > 0.001 && Math.abs(A.y - B.y) < 7) {
        const nx = dx / d, nz = dz / d, ma = A.V.mass || 1, mb = B.V.mass || 1, ia = 1 / ma, ib = 1 / mb, pen = (ra + rb - d);
        A.x -= nx * pen * ia / (ia + ib); A.z -= nz * pen * ia / (ia + ib); B.x += nx * pen * ib / (ia + ib); B.z += nz * pen * ib / (ia + ib);
        const rel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rel < 0) { const j = -rel * 1.5 / (ia + ib); A.vx -= nx * j * ia; A.vz -= nz * j * ia; B.vx += nx * j * ib; B.vz += nz * j * ib; }
        for (const [P, Q, sg] of [[A, B, 1], [B, A, -1]]) {
          if (P.turboT > 0 && Q.immuneT <= 0) {
            // knock aside: push along contact normal + sideways
            const kx = nx * sg, kz = nz * sg, side = (kx * Math.sin(P.heading) - kz * Math.cos(P.heading)) >= 0 ? 1 : -1;
            this.hit(Q, { kx: kx * Wt.ramKnock - Math.sin(P.heading) * side * Wt.ramKnock * 0.5, kz: kz * Wt.ramKnock + Math.cos(P.heading) * side * Wt.ramKnock * 0.5, up: Wt.ramUp, spin: 0.6, slow: 0.6, by: P, kind: 'ram' });
          }
          if (P.bomb && !Q.bomb && P.bomb.passCD <= 0) { Q.bomb = { ...P.bomb, passCD: CONFIG.weapons.bomb.passCooldown, owner: P }; P.bomb = null; this.emit({ type: 'bombPass', from: P, to: Q }); }
        }
      }
    }
    if (this.weapons) this.weapons.step(dt);
    for (const r of this.racers) this.post(r, dt);
  }
  carStep(r, dt) {
    const c = r.V, sf = r.surface === 'grass' && c.grass ? c.grass : CONFIG.surfaces[r.surface].car, inp = r.input;
    const ctl = r.controllable, power = ctl && r.stunT <= 0, turbo = r.turboT > 0, Wt = CONFIG.weapons.turbo;
    const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
    let vF = r.vx * ch + r.vz * sh, vL = -r.vx * sh + r.vz * ch;
    const top = c.topSpeed * sf.speed * (turbo ? Wt.speedMul : 1);
    let thr = power ? clamp(inp.thr, -1, 1) : 0; if (turbo && power) thr = 1;
    const steer = ctl ? clamp(inp.steer, -1, 1) : 0;
    r.drifting = false;
    if (r.grounded) {
      if (thr > 0.02) {
        const launch = 1 + c.launchBoost * Math.max(0, 1 - Math.max(0, vF) / top);
        if (vF < 0) vF = Math.min(0, vF + c.brakeDecel * thr * dt);
        else if (vF < top) vF = Math.min(top, vF + c.accel * sf.accel * thr * launch * (turbo ? Wt.accelMul : 1) * dt);
      } else if (thr < -0.02) {
        if (vF > 0) vF = Math.max(0, vF + c.brakeDecel * thr * dt);
        else vF = Math.max(-c.reverseTop, vF + c.accel * 0.6 * thr * dt);
      } else vF -= Math.sign(vF) * Math.min(Math.abs(vF), c.coastDecel * (power ? 1 : 2.5) * dt);
      if (vF > top) vF -= (vF - top) * 2.5 * dt;
      vF -= CONFIG.gravity * CONFIG.terrain.slopeAccel * (r.slopeF || 0) * dt; // uphill slows, downhill speeds up
      r.drifting = ctl && Math.abs(steer) > c.driftThreshold && vF > c.topSpeed * c.driftMinSpeed;
      let grip = c.grip * sf.grip * (r.drifting ? c.driftGrip : 1); if (r.spinT > 0) grip = 1.5;
      vL *= Math.exp(-grip * dt);
      const steerAmt = Math.min(1, Math.abs(vF) / c.steerSpeedRef) * (1 - c.highSpeedSteerLoss * Math.min(1, Math.abs(vF) / c.topSpeed));
      r.heading += steer * c.steerRate * steerAmt * (r.drifting ? c.driftSteerBoost : 1) * Math.sign(vF) * dt;
      if (ctl && inp.jump && r.jumpCD <= 0) { r.vy = c.jumpV; r.grounded = false; r.jumpCD = c.jumpCooldown + 0.2; this.emit({ type: 'jump', r }); }
    } else {
      r.heading += steer * c.airSteer * dt; // a little air control
      if (turbo) vF = Math.min(top, vF + c.accel * 0.5 * dt);
    }
    if (r.spinT > 0) { r.heading += r.spinDir * CONFIG.weapons.hit.spinRate * Math.min(1, r.spinT * 2) * dt; vF *= Math.exp(-1.8 * dt); }
    if (r.tumbleT > 0) { vF *= Math.exp(-1.2 * dt); }
    r.vx = vF * ch - vL * sh; r.vz = vF * sh + vL * ch;
    if (!r.grounded) { r.vy -= CONFIG.gravity * (r.floaty ? CONFIG.terrain.airGravityMul : 1) * dt; r.airT += dt; }
    r.x += r.vx * dt; r.z += r.vz * dt; r.y += r.vy * dt;
  }
  // floor / obstacle-top / terrain support: follow ramps & hills, take off when the ground falls away, land
  groundSupport(r, dt) {
    const c = r.V, T = this.T, TC = CONFIG.terrain, rad = c.radius - 2.5, base = Math.max(r.y, r._py);
    let tg = T.groundAt(r.x, r.z);
    if (tg > base + TC.maxStep) { // the side of a ramp / garage edge acts like a wall
      if (Math.hypot(r.vx, r.vz) > 60) this.emit({ type: 'bump', r });
      if (T.groundAt(r.x, r._pz) <= base + TC.maxStep) { r.z = r._pz; r.vz *= -0.2; }      // slide along x
      else if (T.groundAt(r._px, r.z) <= base + TC.maxStep) { r.x = r._px; r.vx *= -0.2; } // slide along z
      else { r.x = r._px; r.z = r._pz; r.vx *= -0.3; r.vz *= -0.3; }
      r.scrapeT = 0.2; tg = T.groundAt(r.x, r.z);
    }
    let g = tg; const reach = base + c.stepUp + 0.01;
    for (const s of T.solids) if (s.y1 <= reach && s.y1 > g && r.x + rad > s.x0 && r.x - rad < s.x1 && r.z + rad > s.z0 && r.z - rad < s.z1) g = s.y1;
    const prevTg = r._tg ?? tg; r._tg = tg; r.groundY = g;
    const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
    r.slopeF = g > tg + 0.01 ? 0 : clamp((T.groundAt(r.x + ch * 2.5, r.z + sh * 2.5) - T.groundAt(r.x - ch * 2.5, r.z - sh * 2.5)) / 5, -0.7, 0.7);
    if (!r.grounded) {
      if (r.y <= g + 0.01) {
        if (r.vy <= 0) {
          r.landImpact = Math.min(1, -r.vy / 320); if (r.airT > 0.12) this.emit({ type: 'land', r, impact: r.landImpact });
          r.y = g; r.vy = 0; r.grounded = true; r.airT = 0; r.floaty = false;
        } else r.y = g; // still rising but the slope rises faster: ride up on it
      }
      return;
    }
    const G = CONFIG.gravity;
    if (r.y > g + 0.05 + 0.5 * G * dt * dt) { // ground dropped away faster than gravity can follow → airborne
      r.grounded = false; r.floaty = true; r.airT = 0;
      if (r.vy > 12) { const f = T.featureAt(r._px, r._pz); const k = f ? (f.kind === 'bump' ? TC.hillKick : (f.kick ?? 1) * TC.rampKick) : 1; r.vy *= k; if (f && f.kind === 'ramp') this.emit({ type: 'launch', r, f }); }
      return;
    }
    const rate = g > tg + 0.01 ? 0 : (tg - prevTg) / dt;
    r.y = g; r.vy = clamp(rate, -300, 420);
  }
  droneStep(r, dt) {
    const d = r.V, T = this.T, sf = CONFIG.surfaces[r.surface].drone, inp = r.input;
    const FA = CONFIG.flyerAssist || {}, as = clamp(FA.level ?? 0, 0, 1), pilot = r.isPlayer && !r.autopilot && !r.finished && as > 0;
    if (this.running) r.spool = Math.min(1, r.spool + dt / d.spoolTime);
    const ctl = r.controllable, power = ctl && r.stunT <= 0;
    const gnd = T.groundAt(r.x, r.z); r.groundY = gnd;
    let altIn = clamp(inp.alt, -1, 1), steerIn = ctl ? clamp(inp.steer, -1, 1) : 0;
    if (pilot) { // ---- pilot assist (human flyers only; AI pilots itself) ----
      steerIn *= 1 - FA.yawExpo * as * (1 - Math.abs(steerIn));
      const safe = T.droneSafeAlt[r.idx];
      let want = Math.min(T.gndAhead[r.idx] + FA.cruiseAlt, safe);
      for (const p of T.pads) { const ah = T.wrapS(p.s - r.s); if (ah > -10 && ah < 90) want = Math.min(want, p.y + CONFIG.turboPads.flyHeight); } // dip to catch turbo pads
      if (FA.autoAltitude && Math.abs(altIn) < 0.12) { if (this.running) altIn = clamp(((want - r.y) / 7 - r.vy / 50) * as + altIn * (1 - as), -1, 1); }
      else if (FA.ceilingGuard && altIn > 0 && r.y > safe - 3) altIn = Math.min(altIn, clamp((safe - r.y) / 6, -1, 1) * as + altIn * (1 - as));
      r.assistAlt = want;
      if (Math.abs(steerIn) < 0.15 && r.y - gnd > d.takeoffAltitude && FA.headingAssist) {
        const ti = (r.idx + Math.round((28 + r.speed * 0.3) / T.ds)) % T.N;
        const tx = T.px[ti] + T.nx[ti] * T.droneLine[ti] * 0.5, tz = T.pz[ti] + T.nz[ti] * T.droneLine[ti] * 0.5;
        const err = wrapA(Math.atan2(tz - r.z, tx - r.x) - r.heading);
        if (Math.abs(err) < 1.4) r.heading += clamp(err, -0.6, 0.6) * FA.headingAssist * as * dt;
      }
    }
    if (ctl && inp.jump && r.jumpCD <= 0) { r.vy = Math.max(r.vy, d.hopV); r.jumpCD = 0.6; this.emit({ type: 'jump', r }); }
    const wob = (d.hoverWobble || 0) * (1 - (FA.wobbleCut || 0) * as);
    if (power) {
      let tv = altIn * d.climbRate * r.spool;
      if (wob && r.y - gnd > d.takeoffAltitude) { r._wob = (r._wob || 0) + (Math.random() - 0.5) * 6 * dt; r._wob *= Math.exp(-0.8 * dt); tv += clamp(r._wob, -1, 1) * wob - Math.abs(r.tiltP || 0) * wob * 0.6; }
      r.vy += (tv - r.vy) * Math.min(1, d.climbResponse * dt);
    }
    else if (r.stunT > 0) r.vy -= CONFIG.weapons.zap.droneDrop * 2 * dt;   // power cut: drops
    else r.vy += (-8 - r.vy) * Math.min(1, 1.2 * dt);                       // tumbling: floaty sink
    r.y += r.vy * dt;
    if (r.y <= gnd) { r.y = gnd; if (r.vy < 0) r.vy = 0; }
    if (r.y > CONFIG.maxAltitude + gnd) { r.y = CONFIG.maxAltitude + gnd; if (r.vy > 0) r.vy = 0; }
    const air = r.y - gnd > d.takeoffAltitude;
    const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
    let pitch = power ? (r.turboT > 0 ? 1 : clamp(inp.pitch, -1, 1)) : 0;
    if (d.tiltResponse > 0) { r.tiltP = (r.tiltP || 0) + (pitch - (r.tiltP || 0)) * Math.min(1, d.tiltResponse * (1 + (FA.tiltBoost || 0) * as) * dt); pitch = r.tiltP; } // rotor disc tilts first, then thrust follows
    const a = pitch * d.thrust * sf.accel * r.spool * (air ? 1 : 0.12) * sf.speed * (r.turboT > 0 ? CONFIG.weapons.turbo.droneThrustMul : 1);
    r.vx += ch * a * dt; r.vz += sh * a * dt;
    const dr = Math.exp(-(d.drag + (Math.abs(pitch) < 0.1 ? (FA.brakeDrag || 0) * as : 0)) * dt); r.vx *= dr; r.vz *= dr;
    let vF = r.vx * ch + r.vz * sh, vL = -r.vx * sh + r.vz * ch;
    vL *= Math.exp(-(d.lateralDamp + (FA.extraLateralDamp || 0) * as) * dt);
    if (!air) { const g = Math.exp(-d.groundFriction * dt); vF *= g; vL *= g; }
    r.vx = vF * ch - vL * sh; r.vz = vF * sh + vL * ch;
    r.heading += steerIn * d.yawRate * Math.max(0.3, r.spool) * dt;
    if (r.spinT > 0) r.heading += r.spinDir * CONFIG.weapons.hit.spinRate * 0.8 * Math.min(1, r.spinT * 2) * dt;
    r.x += r.vx * dt; r.z += r.vz * dt;
  }
  // circle (xz) vs box push-out: corners are round, so nothing snags on an edge; glancing hits slide along the wall,
  // only the head-on part of the velocity bounces; cars pressed nose-first into a wall get turned to slide along it.
  collideSolids(r) {
    const V = r.V, rad = V.radius - 1.5, h = V.height, isCar = r.type === 'car';
    for (const s of this.T.solids) {
      if (r.x + rad <= s.x0 || r.x - rad >= s.x1 || r.z + rad <= s.z0 || r.z - rad >= s.z1 || r.y + h <= s.y0 || r.y >= s.y1) continue;
      if (isCar && Math.max(r._py, r.y) >= s.y1 - V.stepUp - 0.01) continue; // on/over the top: handled by groundSupport
      const cx = r.x < s.x0 ? s.x0 : r.x > s.x1 ? s.x1 : r.x, cz = r.z < s.z0 ? s.z0 : r.z > s.z1 ? s.z1 : r.z;
      let nx = r.x - cx, nz = r.z - cz, d = Math.hypot(nx, nz), pen;
      if (d > 1e-4) { if (d >= rad) continue; nx /= d; nz /= d; pen = rad - d; }
      else { // centre inside the box: shortest way out
        const ex = [r.x - s.x0, s.x1 - r.x, r.z - s.z0, s.z1 - r.z]; let m = 0; for (let k = 1; k < 4; k++) if (ex[k] < ex[m]) m = k;
        nx = m === 0 ? -1 : m === 1 ? 1 : 0; nz = m === 2 ? -1 : m === 3 ? 1 : 0; pen = ex[m] + rad;
      }
      let py = 1e9, pyDir = 0;
      if (!isCar) { const pya = r.y + h - s.y0, pyb = s.y1 - r.y; if (pya < pyb) { py = pya; pyDir = -1; } else { py = pyb; pyDir = 1; } }
      else if (r._py + h <= s.y0 + 0.5) { py = r.y + h - s.y0; pyDir = -1; } // bonk head on a ceiling while jumping
      if (py < pen) { r.y += pyDir * py; if (r.vy * pyDir < 0) r.vy = 0; continue; }
      r.x += nx * (pen + 0.01); r.z += nz * (pen + 0.01); r.scrapeT = 0.2;
      const sp = Math.hypot(r.vx, r.vz), vn = r.vx * nx + r.vz * nz;
      if (vn < 0) {
        const headOn = sp > 1e-3 ? -vn / sp : 1, kb = (isCar ? V.wallBounce : 0.2) * headOn * headOn, ks = isCar ? V.wallSlide : 0.97;
        if (-vn > 60) this.emit({ type: 'bump', r });
        const tx = r.vx - vn * nx, tz = r.vz - vn * nz; // tangential part slides on
        r.vx = tx * ks - vn * kb * nx; r.vz = tz * ks - vn * kb * nz;
      }
      if (isCar && r.grounded && r.controllable) { // nose into the wall → swing it along the wall (towards the track direction)
        const ch = Math.cos(r.heading), sh = Math.sin(r.heading), into = -(ch * nx + sh * nz);
        if (into > 0.25) {
          const T = this.T, ti = r.idx, tdx = T.tx[ti], tdz = T.tz[ti]; let ax = -nz, az = nx; if (ax * tdx + az * tdz < 0) { ax = -ax; az = -az; }
          const e = wrapA(Math.atan2(az, ax) - r.heading); r.heading += clamp(e, -1, 1) * 2.5 * into * (1 / CONFIG.physicsHz);
        }
      }
    }
  }
  post(r, dt) {
    const T = this.T, V = r.V, TP = CONFIG.turboPads;
    const pr = T.project(r.x, r.z, r.idx, this._pr);
    // lateral limits (barriers / drone shortcut margin)
    const i = pr.idx, hwT = T.halfW[i], inner = hwT - V.halfWidth;
    let maxL = inner, minL = 0;
    if (r.type === 'drone') {
      const m = CONFIG.droneShortcutMargin * T.marginF[i]; const high = r.y - (r.groundY || 0) > CONFIG.barrierHeight + 0.5;
      if (high) maxL = inner + m;
      else if (Math.abs(r._lat) > hwT + 1 && hwT + 3 + V.halfWidth <= inner + m) { maxL = inner + m; minL = hwT + 3 + V.halfWidth; }
    }
    const al = Math.abs(pr.lat), sg = Math.sign(pr.lat) || 1, nx = T.nx[i], nz = T.nz[i];
    const RC = CONFIG.rescue;
    if (RC?.enabled && RC.softBand > 0 && minL === 0 && maxL > RC.softBand * 1.5 && al > maxL - RC.softBand && r.rescueT <= 0) { // invisible soft boundary
      const f = Math.min(1, (al - (maxL - RC.softBand)) / RC.softBand), vout = (r.vx * nx + r.vz * nz) * sg;
      if (vout > 0) { const k = Math.min(1, RC.softPush * f * dt); r.vx -= nx * sg * vout * k; r.vz -= nz * sg * vout * k; }
      if (r.type === 'car' && r.grounded && r.controllable) {
        const hOut = (Math.cos(r.heading) * nx + Math.sin(r.heading) * nz) * sg;
        if (hOut > 0.05) { const e = wrapA(Math.atan2(T.tz[i], T.tx[i]) - r.heading); if (Math.abs(e) < 1.7) r.heading += clamp(e, -1, 1) * RC.softSteer * f * dt; }
      }
    }
    let corr = 0; if (al > maxL) corr = al - maxL; else if (al < minL) corr = al - minL;
    if (corr !== 0) {
      r.x -= nx * sg * corr; r.z -= nz * sg * corr; pr.lat -= sg * corr;
      const vn = (r.vx * nx + r.vz * nz) * sg * Math.sign(corr);
      if (vn > 0) { r.vx -= nx * sg * Math.sign(corr) * vn * 1.15; r.vz -= nz * sg * Math.sign(corr) * vn * 1.15; }
      r.vx *= 0.995; r.vz *= 0.995; r.scrapeT = 0.2;
    }
    // gates (must pass under the bar)
    const sPrev = r.s; let sNew = pr.s;
    for (const g of T.gates) {
      const rp = T.wrapS(sPrev - g.s), rn = T.wrapS(sNew - g.s);
      if (rp < 0 && rn >= 0 && rp > -60) {
        if (r.y + V.height > g.h) {
          r.x = r._px; r.z = r._pz; sNew = sPrev; pr.idx = r.idx; pr.lat = r._lat;
          const tx = T.tx[g.i], tz = T.tz[g.i]; const vt = r.vx * tx + r.vz * tz;
          if (vt > 0) { r.vx -= tx * vt * 1.4; r.vz -= tz * vt * 1.4; }
          r.gateBlockT = 1.5;
        } else if (r.isPlayer) r.lastGate = g.index;
      }
    }
    r.progress += T.wrapS(sNew - sPrev);
    r.idx = pr.idx; r.s = sNew; r.lat = pr.lat;
    r.section = T.section[r.idx]; if (this.running && !r.finished) { r.secT = r.secT || {}; r.secT[r.section] = (r.secT[r.section] || 0) + dt; r.maxSp = r.maxSp||{}; r.maxSp[r.section] = Math.max(r.maxSp[r.section]||0, r.speed); } r.surface = T.surfaceAt(r.x, r.z, r.idx);
    // turbo pads: ground vehicles AND flyers (within TP.maxHeight above the pad) get the same short, strong boost
    r.onPad = false; if (r.padCD > 0) r.padCD -= dt;
    for (const p of T.pads) if (Math.hypot(p.x - r.x, p.z - r.z) < TP.radius && r.y - p.y < TP.maxHeight && r.y > p.y - 3) {
      r.onPad = true;
      if (this.running && r.padCD <= 0 && r.rescueT <= 0) { r.turboT = Math.max(r.turboT, TP.time); r.padCD = TP.cooldown; r.padHits++; this.emit({ type: 'turboPad', r, pad: p }); }
    }
    // wrong way
    const dot = Math.cos(r.heading) * T.tx[r.idx] + Math.sin(r.heading) * T.tz[r.idx];
    r.wrongWayT = (dot < -0.3 && r.speed > 8) ? r.wrongWayT + dt : 0;
    r.gateBlockT = Math.max(0, r.gateBlockT - dt); r.scrapeT = Math.max(0, r.scrapeT - dt);
    this.monitor(r, dt);
    // laps
    if (this.running && !r.finished && r.progress >= (r.lapsDone + 1) * T.L) {
      r.lapsDone++; const lt = this.t - r.lapStart; r.lapTimes.push(lt); r.best = Math.min(r.best, lt); r.lapStart = this.t;
      if (r.lapsDone >= CONFIG.laps) { r.finished = true; r.finishTime = this.t; this.finishOrder.push(r); }
    }
  }
  standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }
}
